import type { Booking, Expense, Income, Object as Obj, Room } from '@/lib/types';
import { getExpenseSum, getIncomeSum } from '@/lib/accountancyUtils';
import { resolveCategoryName } from '@/lib/accountancyCategoryResolve';
import { isExcludedFromAccountancyRoomStatsSum } from '@/lib/noBookingCategorySubgroups';
import {
    groupAccountancyObjectsByName,
    mergeRoomsForAccountancyObjectGroup,
    recordObjectMatchesAccountancySelection,
    stableAccountancyRoomLabel,
} from '@/lib/accountancyObjectGroups';

export type AccountancyObjectRoomRowHighlight = 'red' | 'white';

export function accountancyRoomHighlightKey(objectId: number, roomKey: string): string {
    return `${objectId}\u0001${roomKey}`;
}

function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Месяц YYYY-MM: отчётный месяц, иначе календарный по дате операции. */
function ledgerMonthFromRecord(
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

function isZeroish(n: number): boolean {
    return !Number.isFinite(n) || Math.abs(n) < 1e-9;
}

type GroupBalanceContext = {
    anchor: Obj;
    members: Obj[];
    rooms: Room[];
    nameSet: Set<string>;
    roomByUnitId: Map<number, string>;
};

function buildGroupBalanceContexts(objects: Obj[]): GroupBalanceContext[] {
    return groupAccountancyObjectsByName(objects).map((group) => {
        const members = group.members;
        const anchor = members[0];
        const rooms = mergeRoomsForAccountancyObjectGroup(members);
        const nameSet = new Set(rooms.map((r) => stableAccountancyRoomLabel(r)));
        const roomByUnitId = new Map<number, string>();
        for (const obj of members) {
            for (const room of obj.roomTypes ?? []) {
                roomByUnitId.set(room.id, stableAccountancyRoomLabel(room));
            }
        }
        return { anchor, members, rooms, nameSet, roomByUnitId };
    });
}

function createRoomResolver(
    ctx: GroupBalanceContext,
    allObjects: Obj[],
    bookingsById: Map<number, Booking>,
): (recordObjectId: number, recordRoomName?: string | null, bookingId?: number) => string | null {
    const { anchor, rooms, nameSet, roomByUnitId } = ctx;

    return (recordObjectId: number, recordRoomName?: string | null, bookingId?: number): string | null => {
        if (!recordObjectMatchesAccountancySelection(recordObjectId, anchor, allObjects)) return null;

        const ridExplicit = (recordRoomName ?? '').trim();
        if (ridExplicit && nameSet.has(ridExplicit)) {
            return ridExplicit;
        }

        const bid = normalizeUnitOrRoomId(bookingId);
        if (bid != null) {
            const booking = bookingsById.get(bid);
            if (booking) {
                const uid = normalizeUnitOrRoomId(booking.unitId);
                if (uid != null) {
                    const label = roomByUnitId.get(uid);
                    if (label != null && nameSet.has(label)) return label;
                }
            }
        }

        if (ridExplicit) return ridExplicit;
        return null;
    };
}

type RoomMonthTotals = { opening: number; expenses: number; incomes: number };

/**
 * Одним проходом по проводкам — подсветка всех комнат в дереве объектов.
 */
export function buildAccountancyRoomHighlightMap(params: {
    allObjects: Obj[];
    selectedMonth: string;
    bookings: Booking[];
    expenses: Expense[];
    incomes: Income[];
    categoryNameById: Map<string, string>;
}): Map<string, AccountancyObjectRoomRowHighlight> {
    const { allObjects, selectedMonth, bookings, expenses, incomes, categoryNameById } = params;
    const month = selectedMonth.trim();
    const result = new Map<string, AccountancyObjectRoomRowHighlight>();

    if (!/^\d{4}-\d{2}$/.test(month)) {
        return result;
    }

    const bookingsById = new Map<number, Booking>();
    for (const b of bookings) {
        const id = normalizeUnitOrRoomId(b.id);
        if (id != null) bookingsById.set(id, b);
    }

    const groupContexts = buildGroupBalanceContexts(allObjects);
    const primaryByRecordObjectId = new Map<number, number>();
    const resolversByPrimary = new Map<number, ReturnType<typeof createRoomResolver>>();
    const totalsByPrimary = new Map<number, Map<string, RoomMonthTotals>>();

    const getPrimaryObjectId = (recordObjectId: number): number | null => {
        const cached = primaryByRecordObjectId.get(recordObjectId);
        if (cached !== undefined) return Number.isNaN(cached) ? null : cached;
        for (const ctx of groupContexts) {
            if (recordObjectMatchesAccountancySelection(recordObjectId, ctx.anchor, allObjects)) {
                primaryByRecordObjectId.set(recordObjectId, ctx.anchor.id);
                return ctx.anchor.id;
            }
        }
        primaryByRecordObjectId.set(recordObjectId, Number.NaN);
        return null;
    };

    const getResolver = (primaryId: number) => {
        let resolver = resolversByPrimary.get(primaryId);
        if (!resolver) {
            const ctx = groupContexts.find((g) => g.anchor.id === primaryId);
            if (!ctx) return null;
            resolver = createRoomResolver(ctx, allObjects, bookingsById);
            resolversByPrimary.set(primaryId, resolver);
        }
        return resolver;
    };

    const bump = (primaryId: number, roomKey: string, kind: 'opening' | 'expenses' | 'incomes', amount: number) => {
        let roomMap = totalsByPrimary.get(primaryId);
        if (!roomMap) {
            roomMap = new Map();
            totalsByPrimary.set(primaryId, roomMap);
        }
        const cur = roomMap.get(roomKey) ?? { opening: 0, expenses: 0, incomes: 0 };
        cur[kind] += amount;
        roomMap.set(roomKey, cur);
    };

    const processRecord = (
        recordObjectId: number,
        recordRoomName: string | null | undefined,
        bookingId: number | undefined,
        ledgerMonth: string,
        amount: number,
        kind: 'expense' | 'income',
    ) => {
        const primaryId = getPrimaryObjectId(recordObjectId);
        if (primaryId == null) return;
        const resolveRoom = getResolver(primaryId);
        if (!resolveRoom) return;
        const roomKey = resolveRoom(recordObjectId, recordRoomName, bookingId);
        if (!roomKey) return;

        if (lmBefore(month, ledgerMonth)) {
            bump(primaryId, roomKey, 'opening', kind === 'expense' ? -amount : amount);
        } else if (ledgerMonth === month) {
            bump(primaryId, roomKey, kind === 'expense' ? 'expenses' : 'incomes', amount);
        }
    };

    for (const e of expenses) {
        const lm = ledgerMonthFromRecord(e.date, e.reportMonth);
        if (!lm) continue;
        if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(e, categoryNameById), lm)) continue;
        processRecord(e.objectId, e.roomName, e.bookingId, lm, getExpenseSum(e), 'expense');
    }

    for (const i of incomes) {
        const lm = ledgerMonthFromRecord(i.date, i.reportMonth);
        if (!lm) continue;
        if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(i, categoryNameById), lm)) continue;
        processRecord(i.objectId, i.roomName, i.bookingId, lm, getIncomeSum(i), 'income');
    }

    for (const ctx of groupContexts) {
        const primaryId = ctx.anchor.id;
        const roomMap = totalsByPrimary.get(primaryId);
        const balanceByRoomKey = new Map<string, number>();
        for (const room of ctx.rooms) {
            const roomKey = stableAccountancyRoomLabel(room);
            if (balanceByRoomKey.has(roomKey)) continue;
            const totals = roomMap?.get(roomKey);
            const balance = totals
                ? totals.opening - totals.expenses + totals.incomes
                : 0;
            balanceByRoomKey.set(roomKey, balance);
        }
        for (const member of ctx.members) {
            for (const room of member.roomTypes ?? []) {
                const roomKey = stableAccountancyRoomLabel(room);
                const balance = balanceByRoomKey.get(roomKey) ?? 0;
                result.set(
                    accountancyRoomHighlightKey(member.id, roomKey),
                    isZeroish(balance) ? 'white' : 'red',
                );
            }
        }
    }

    return result;
}

function lmBefore(selectedMonth: string, ledgerMonth: string): boolean {
    return ledgerMonth < selectedMonth;
}

/**
 * Баланс комнаты за выбранный месяц — как в таблице «Баланс по комнатам»:
 * остаток на начало − расходы + доходы.
 */
export function getAccountancyRoomBalanceForMonth(params: {
    objectRow: Obj;
    roomKey: string;
    allObjects: Obj[];
    selectedMonth: string;
    bookings: Booking[];
    expenses: Expense[];
    incomes: Income[];
    categoryNameById: Map<string, string>;
}): number {
    const { objectRow, roomKey, allObjects, selectedMonth, bookings, expenses, incomes, categoryNameById } =
        params;
    const month = selectedMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return 0;

    const bookingsById = new Map<number, Booking>();
    for (const b of bookings) {
        const id = normalizeUnitOrRoomId(b.id);
        if (id != null) bookingsById.set(id, b);
    }

    const ctx = buildGroupBalanceContexts(allObjects).find((g) =>
        recordObjectMatchesAccountancySelection(objectRow.id, g.anchor, allObjects),
    );
    if (!ctx) return 0;

    const resolveRoom = createRoomResolver(ctx, allObjects, bookingsById);
    let openingBalance = 0;
    let expensesSum = 0;
    let incomesSum = 0;

    for (const e of expenses) {
        if (!recordObjectMatchesAccountancySelection(e.objectId, ctx.anchor, allObjects)) continue;
        const lm = ledgerMonthFromRecord(e.date, e.reportMonth);
        if (!lm) continue;
        if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(e, categoryNameById), lm)) continue;
        if (resolveRoom(e.objectId, e.roomName, e.bookingId) !== roomKey) continue;
        const amount = getExpenseSum(e);
        if (lm < month) openingBalance += -amount;
        else if (lm === month) expensesSum += amount;
    }

    for (const i of incomes) {
        if (!recordObjectMatchesAccountancySelection(i.objectId, ctx.anchor, allObjects)) continue;
        const lm = ledgerMonthFromRecord(i.date, i.reportMonth);
        if (!lm) continue;
        if (isExcludedFromAccountancyRoomStatsSum(resolveCategoryName(i, categoryNameById), lm)) continue;
        if (resolveRoom(i.objectId, i.roomName, i.bookingId) !== roomKey) continue;
        const amount = getIncomeSum(i);
        if (lm < month) openingBalance += amount;
        else if (lm === month) incomesSum += amount;
    }

    return openingBalance - expensesSum + incomesSum;
}

/** @deprecated Используйте buildAccountancyRoomHighlightMap */
export function resolveAccountancyObjectRoomRowHighlight(params: {
    objectRow: Obj;
    roomName: string;
    allObjects: Obj[];
    selectedMonth: string;
    bookings: Booking[];
    expenses: Expense[];
    incomes: Income[];
    categoryNameById: Map<string, string>;
}): AccountancyObjectRoomRowHighlight {
    const balance = getAccountancyRoomBalanceForMonth({ ...params, roomKey: params.roomName });
    return isZeroish(balance) ? 'white' : 'red';
}
