import type { Db } from 'mongodb';

export const ACCOUNTANCY_CLOSED_MONTHS_COLLECTION = 'accountancyClosedMonths';

export const REPORT_MONTH_CLOSED_MESSAGE =
    'Отчётный период зафиксирован. Добавление, изменение и удаление транзакций за этот месяц недоступно.';

export type ClosedMonthCheckResult =
    | { ok: true }
    | { ok: false; message: string; code: 'REPORT_MONTH_CLOSED' };

export type ClosedRoomPeriod = {
    reportMonth: string;
    objectId: number;
    roomKey: string;
};

export type ClosedPeriodsData = {
    globalMonths: string[];
    roomPeriods: ClosedRoomPeriod[];
};

export type ClosedPeriodsCache = {
    globalMonths: Set<string>;
    roomPeriods: Set<string>;
};

/** Месяц YYYY-MM: отчётный месяц записи, иначе календарный по дате операции. */
export function resolveLedgerMonth(
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
): string | null {
    const rm = (reportMonth ?? '').trim();
    if (/^\d{4}-\d{2}$/.test(rm)) return rm;
    if (!date) return null;
    const parsed = new Date(date as string | Date);
    if (Number.isNaN(parsed.getTime())) return null;
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

export function isValidReportMonthKey(value: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim());
}

export function normalizeRoomKeyForLock(roomName: string | null | undefined): string {
    if (roomName == null) return '';
    return String(roomName).trim();
}

export function closedRoomPeriodKey(reportMonth: string, objectId: number, roomKey: string): string {
    return `${reportMonth}:${objectId}:${roomKey}`;
}

export function buildClosedPeriodsCache(data: ClosedPeriodsData): ClosedPeriodsCache {
    return {
        globalMonths: new Set(data.globalMonths),
        roomPeriods: new Set(
            data.roomPeriods.map((p) => closedRoomPeriodKey(p.reportMonth, p.objectId, p.roomKey)),
        ),
    };
}

export function isLedgerPeriodClosed(
    cache: ClosedPeriodsCache,
    reportMonth: string,
    objectId?: number | null,
    roomName?: string | null,
): boolean {
    if (cache.globalMonths.has(reportMonth)) return true;
    if (objectId == null || !Number.isFinite(objectId)) return false;
    const roomKey = normalizeRoomKeyForLock(roomName);
    if (!roomKey) return false;
    return cache.roomPeriods.has(closedRoomPeriodKey(reportMonth, objectId, roomKey));
}

function isGlobalClosedDoc(doc: Record<string, unknown>): boolean {
    return doc.objectId == null && (doc.roomKey == null || String(doc.roomKey).trim() === '');
}

export async function getClosedPeriodsData(db: Db): Promise<ClosedPeriodsData> {
    const docs = await db
        .collection(ACCOUNTANCY_CLOSED_MONTHS_COLLECTION)
        .find({})
        .project({ reportMonth: 1, objectId: 1, roomKey: 1 })
        .sort({ reportMonth: -1, objectId: 1, roomKey: 1 })
        .toArray();

    const globalMonths: string[] = [];
    const roomPeriods: ClosedRoomPeriod[] = [];

    for (const doc of docs) {
        const reportMonth = String(doc.reportMonth ?? '').trim();
        if (!isValidReportMonthKey(reportMonth)) continue;

        if (isGlobalClosedDoc(doc as Record<string, unknown>)) {
            globalMonths.push(reportMonth);
            continue;
        }

        const objectId = Number(doc.objectId);
        const roomKey = normalizeRoomKeyForLock(doc.roomKey != null ? String(doc.roomKey) : '');
        if (!Number.isFinite(objectId) || !roomKey) continue;
        roomPeriods.push({ reportMonth, objectId, roomKey });
    }

    return { globalMonths, roomPeriods };
}

export async function getClosedPeriodsCache(db: Db): Promise<ClosedPeriodsCache> {
    return buildClosedPeriodsCache(await getClosedPeriodsData(db));
}

/** @deprecated Используйте getClosedPeriodsData — только глобальные месяцы */
export async function getClosedReportMonths(db: Db): Promise<string[]> {
    const data = await getClosedPeriodsData(db);
    const months = new Set(data.globalMonths);
    for (const p of data.roomPeriods) {
        months.add(p.reportMonth);
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a));
}

/** @deprecated Используйте getClosedPeriodsCache */
export async function getClosedReportMonthsSet(db: Db): Promise<Set<string>> {
    return new Set(await getClosedReportMonths(db));
}

export async function isReportMonthClosed(db: Db, reportMonth: string): Promise<boolean> {
    if (!isValidReportMonthKey(reportMonth)) return false;
    const cache = await getClosedPeriodsCache(db);
    if (cache.globalMonths.has(reportMonth)) return true;
    for (const key of cache.roomPeriods) {
        if (key.startsWith(`${reportMonth}:`)) return true;
    }
    return false;
}

export async function assertLedgerMonthOpen(
    db: Db,
    date: Date | string | undefined,
    reportMonth: string | undefined | null,
    objectId?: number | null,
    roomName?: string | null,
    closedCache?: ClosedPeriodsCache,
): Promise<ClosedMonthCheckResult> {
    const month = resolveLedgerMonth(date, reportMonth);
    if (!month) return { ok: true };

    const closed = closedCache ?? (await getClosedPeriodsCache(db));
    if (isLedgerPeriodClosed(closed, month, objectId, roomName)) {
        return { ok: false, message: REPORT_MONTH_CLOSED_MESSAGE, code: 'REPORT_MONTH_CLOSED' };
    }
    return { ok: true };
}

export type TransactionLedgerFields = {
    date?: Date | string;
    reportMonth?: string | null;
    objectId?: number;
    roomName?: string | null;
};

export async function assertTransactionDocEditable(
    db: Db,
    doc: TransactionLedgerFields | null | undefined,
    closedCache?: ClosedPeriodsCache,
): Promise<ClosedMonthCheckResult> {
    if (!doc) return { ok: true };
    return assertLedgerMonthOpen(
        db,
        doc.date,
        doc.reportMonth,
        doc.objectId,
        doc.roomName,
        closedCache,
    );
}

export async function assertTransactionMutationAllowed(
    db: Db,
    params: {
        date: Date | string | undefined;
        reportMonth: string | undefined | null;
        objectId?: number;
        roomName?: string | null;
        existingDoc?: TransactionLedgerFields | null;
    },
    closedCache?: ClosedPeriodsCache,
): Promise<ClosedMonthCheckResult> {
    const newCheck = await assertLedgerMonthOpen(
        db,
        params.date,
        params.reportMonth,
        params.objectId,
        params.roomName,
        closedCache,
    );
    if (!newCheck.ok) return newCheck;

    if (params.existingDoc) {
        const oldCheck = await assertLedgerMonthOpen(
            db,
            params.existingDoc.date,
            params.existingDoc.reportMonth,
            params.existingDoc.objectId,
            params.existingDoc.roomName,
            closedCache,
        );
        if (!oldCheck.ok) return oldCheck;
    }

    return { ok: true };
}

export type RoomPeriodInput = {
    objectId: number;
    roomKey: string;
};

export function parseRoomPeriodInputs(raw: unknown): RoomPeriodInput[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const result: RoomPeriodInput[] = [];
    for (const item of raw) {
        const objectId = Number((item as { objectId?: unknown })?.objectId);
        const roomKey = normalizeRoomKeyForLock(String((item as { roomKey?: unknown })?.roomKey ?? ''));
        if (!Number.isFinite(objectId) || !roomKey) return null;
        result.push({ objectId, roomKey });
    }
    return result;
}
