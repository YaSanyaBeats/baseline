import type {
    CommissionOwnerViewRoomSection,
    CommissionOwnerViewStoredPayload,
} from '@/lib/commissionOwnerView';

export const ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION = 'accountancyOwnerReportSnapshots';

/** Снимок секции отчёта владельца по комнате и локали. */
export type OwnerReportRoomSnapshot = {
    ownerId: string;
    reportMonth: string;
    objectId: number;
    roomKey: string;
    locale: string;
    /** null — на момент фиксации по комнате не было строк отчёта. */
    roomSection: CommissionOwnerViewRoomSection | null;
    checkPassed: boolean;
    roomTotal: number;
    settlementSum: number;
    /** Версия правил отображения/итогов отчёта (по умолчанию 2). */
    reportVersion?: 1 | 2;
};

/** Статус сохранённого отчёта для матрицы фиксации (без тела отчёта). */
export type SavedOwnerReportStatus = {
    reportMonth: string;
    objectId: number;
    roomKey: string;
    saved: boolean;
    checkPassed: boolean;
};

export function ownerReportSnapshotKey(
    reportMonth: string,
    objectId: number,
    roomKey: string
): string {
    return `${reportMonth}:${objectId}:${roomKey}`;
}

export function ownerReportRoomSectionKey(objectId: number, roomKey: string): string {
    return `${objectId}::${roomKey}`;
}

/**
 * Подменяет секции закрытых комнат сохранёнными.
 * Комната со снимком без секции убирается из живого отчёта.
 */
export function applyRoomSnapshots(
    sections: CommissionOwnerViewRoomSection[],
    snapshots: OwnerReportRoomSnapshot[]
): CommissionOwnerViewRoomSection[] {
    if (snapshots.length === 0) return sections;

    const byKey = new Map(
        snapshots.map((snapshot) => [
            ownerReportRoomSectionKey(snapshot.objectId, snapshot.roomKey),
            snapshot,
        ])
    );
    const used = new Set<string>();
    const result: CommissionOwnerViewRoomSection[] = [];

    for (const section of sections) {
        const snapshot = byKey.get(section.key);
        if (!snapshot) {
            result.push(section);
            continue;
        }
        used.add(section.key);
        if (snapshot.roomSection) result.push(snapshot.roomSection);
    }

    for (const snapshot of snapshots) {
        const key = ownerReportRoomSectionKey(snapshot.objectId, snapshot.roomKey);
        if (used.has(key) || !snapshot.roomSection) continue;
        result.push(snapshot.roomSection);
    }

    return result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
}

/**
 * Снимок нужной версии отчёта.
 * Документ v2 не подставляется в просмотр v1: в нём уже нет приходов,
 * которые v2 скрывает. Старый снимок без версии — исходный полный отчёт.
 */
export function selectSnapshotsForReportVersion(
    snapshots: OwnerReportRoomSnapshot[],
    reportVersion: 1 | 2
): OwnerReportRoomSnapshot[] {
    const groups = new Map<string, OwnerReportRoomSnapshot[]>();
    for (const snapshot of snapshots) {
        const key = `${snapshot.reportMonth}:${snapshot.locale}:${snapshot.objectId}:${snapshot.roomKey}`;
        const list = groups.get(key) ?? [];
        list.push(snapshot);
        groups.set(key, list);
    }

    const selected: OwnerReportRoomSnapshot[] = [];
    for (const list of groups.values()) {
        const exact = list.find((snapshot) => snapshot.reportVersion === reportVersion);
        if (exact) {
            selected.push(exact);
            continue;
        }
        const legacy = list.find((snapshot) => snapshot.reportVersion == null);
        if (legacy) selected.push(legacy);
    }
    return selected;
}

export function payloadWithRoomSections(
    payload: CommissionOwnerViewStoredPayload,
    roomSections: CommissionOwnerViewRoomSection[]
): CommissionOwnerViewStoredPayload {
    const totals = roomSections.reduce(
        (acc, section) => ({
            totalIncome: acc.totalIncome + section.totals.totalIncome,
            totalExpenses: acc.totalExpenses + section.totals.totalExpenses,
            totalCommission: acc.totalCommission + section.totals.totalCommission,
        }),
        { totalIncome: 0, totalExpenses: 0, totalCommission: 0 }
    );
    return { ...payload, roomSections, totals };
}

/** Сводит снимки обеих локалей к одной ячейке матрицы. */
export function aggregateSavedOwnerReportStatuses(
    docs: Array<
        Pick<OwnerReportRoomSnapshot, 'reportMonth' | 'objectId' | 'roomKey' | 'locale' | 'checkPassed' | 'reportVersion'>
    >
): SavedOwnerReportStatus[] {
    const groups = new Map<
        string,
        { reportMonth: string; objectId: number; roomKey: string; locales: Set<string>; checkPassed: boolean }
    >();

    for (const doc of docs) {
        if (doc.reportVersion === 1) continue;
        const key = ownerReportSnapshotKey(doc.reportMonth, doc.objectId, doc.roomKey);
        let group = groups.get(key);
        if (!group) {
            group = {
                reportMonth: doc.reportMonth,
                objectId: doc.objectId,
                roomKey: doc.roomKey,
                locales: new Set(),
                checkPassed: true,
            };
            groups.set(key, group);
        }
        group.locales.add(doc.locale);
        if (!doc.checkPassed) group.checkPassed = false;
    }

    return [...groups.values()].map((group) => ({
        reportMonth: group.reportMonth,
        objectId: group.objectId,
        roomKey: group.roomKey,
        saved: group.locales.has('ru-RU') && group.locales.has('en-US'),
        checkPassed: group.checkPassed,
    }));
}
