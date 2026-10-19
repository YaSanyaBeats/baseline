import type { Db } from 'mongodb';
import type { BookingSearchParams } from '@/lib/bookings';
import type { BookingFetchers } from '@/lib/commissionForObject';
import { computeCommissionOwnerViewPayloads } from '@/lib/commissionOwnerViewCore';
import { getClosedPeriodsData, type RoomPeriodInput } from '@/lib/accountancyClosedMonth';
import { stableAccountancyRoomLabel } from '@/lib/accountancyObjectGroups';
import { getDB } from '@/lib/db/getDB';
import { normalizeMongoIdString } from '@/lib/mongoId';
import {
    ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION,
    aggregateSavedOwnerReportStatuses,
    applyRoomSnapshots,
    ownerReportRoomSectionKey,
    payloadWithRoomSections,
    type OwnerReportRoomSnapshot,
    type SavedOwnerReportStatus,
} from '@/lib/ownerReportSnapshots';
import {
    checkRoomEarningsAgainstSettlements,
    OWNER_REPORT_CHECK_LOCALES,
} from '@/lib/ownerViewRoomEarnings';
import {
    computeOwnerViewV2RoomTotal,
    migrateOwnerViewRoomSectionToV2,
} from '@/lib/ownerViewReportV2Migration';
import { getBookingsByIdsFromDb, searchBookingsFromDb } from '@/lib/server/bookingsQuery';
import { getObjects } from '@/lib/server/getObjects';
import { loadAllCommissionRatesForMonth } from '@/lib/server/bookingManagementCommissionRates';
import type {
    AccountancyCategory,
    Booking,
    Expense,
    Income,
    Object as AppObject,
    User,
    UserObject,
} from '@/lib/types';
import type { CommissionOwnerViewRoomSection, CommissionOwnerViewStoredPayload } from '@/lib/commissionOwnerView';

type SnapshotDoc = OwnerReportRoomSnapshot & {
    savedAt: Date;
    savedBy: string;
    reportVersion?: 1 | 2;
};

function mapDbUser(doc: Record<string, unknown>): User {
    return {
        ...doc,
        _id: normalizeMongoIdString(doc._id),
    } as User;
}

function cachedBookingFetchers(db: Db): BookingFetchers {
    const searchCache = new Map<string, Booking[]>();
    const idsCache = new Map<string, Booking[]>();

    return {
        searchBookings: async (params: BookingSearchParams) => {
            const key = JSON.stringify(params);
            const cached = searchCache.get(key);
            if (cached) return cached;
            const found = await searchBookingsFromDb(db, params);
            searchCache.set(key, found);
            return found;
        },
        getBookingsByIds: async (ids: number[]) => {
            const key = [...ids].sort((a, b) => a - b).join(',');
            const cached = idsCache.get(key);
            if (cached) return cached;
            const found = await getBookingsByIdsFromDb(db, ids);
            idsCache.set(key, found);
            return found;
        },
    };
}

function ownerOwnsRoom(
    owner: User,
    objectId: number,
    roomKey: string,
    objects: AppObject[]
): boolean {
    const obj = objects.find((row) => row.id === objectId || row.propertyId === objectId);
    return (owner.objects ?? []).some((assignment: UserObject) => {
        const assignmentMatches =
            assignment.id === objectId ||
            (obj != null && (assignment.id === obj.id || assignment.id === obj.propertyId));
        if (!assignmentMatches) return false;
        return (assignment.rooms ?? []).some((room) => String(room).trim() === roomKey);
    });
}

function cloneSection<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

const REPORT_VERSIONS = [1, 2] as const;

function storedReportVersion(value: unknown): 1 | 2 | undefined {
    if (value === 1 || value === 2) return value;
    return undefined;
}

async function ensureSnapshotIndex(db: Db): Promise<void> {
    const collection = db.collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION);
    const indexes = await collection.indexes();
    const current = indexes.find((index) => index.name === 'owner_report_snapshot_unique');
    if (current && !Object.prototype.hasOwnProperty.call(current.key ?? {}, 'reportVersion')) {
        await collection.dropIndex('owner_report_snapshot_unique');
    }
    await collection.createIndex(
        { ownerId: 1, reportMonth: 1, objectId: 1, roomKey: 1, locale: 1, reportVersion: 1 },
        { unique: true, name: 'owner_report_snapshot_unique' }
    );
}

export async function listSavedOwnerReportStatuses(db?: Db): Promise<SavedOwnerReportStatus[]> {
    const database = db ?? (await getDB());
    const docs = await database
        .collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION)
        .find(
            {},
            {
                projection: {
                    reportMonth: 1,
                    objectId: 1,
                    roomKey: 1,
                    locale: 1,
                    checkPassed: 1,
                    reportVersion: 1,
                },
            }
        )
        .toArray();

    return aggregateSavedOwnerReportStatuses(
        docs.map((doc) => ({
            reportMonth: String(doc.reportMonth ?? ''),
            objectId: Number(doc.objectId),
            roomKey: String(doc.roomKey ?? ''),
            locale: String(doc.locale ?? ''),
            checkPassed: Boolean(doc.checkPassed),
            reportVersion: storedReportVersion(doc.reportVersion),
        }))
    );
}

export async function deleteOwnerReportSnapshots(
    db: Db,
    reportMonth: string,
    rooms: RoomPeriodInput[]
): Promise<void> {
    if (rooms.length === 0) return;
    await db.collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION).deleteMany({
        reportMonth,
        $or: rooms.map((room) => ({ objectId: room.objectId, roomKey: room.roomKey })),
    });
}

export async function loadOwnerReportSnapshots(
    db: Db,
    ownerId: string,
    reportMonth: string,
    locale: string
): Promise<OwnerReportRoomSnapshot[]> {
    const docs = await db
        .collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION)
        .find({ ownerId, reportMonth, locale })
        .toArray();

    return docs.map((doc) => ({
        ownerId: String(doc.ownerId ?? ''),
        reportMonth: String(doc.reportMonth ?? ''),
        objectId: Number(doc.objectId),
        roomKey: String(doc.roomKey ?? ''),
        locale: String(doc.locale ?? ''),
        roomSection: (doc.roomSection as OwnerReportRoomSnapshot['roomSection']) ?? null,
        checkPassed: Boolean(doc.checkPassed),
        roomTotal: Number(doc.roomTotal ?? 0),
        settlementSum: Number(doc.settlementSum ?? 0),
        reportVersion: storedReportVersion(doc.reportVersion),
    }));
}

export async function loadAllOwnerReportSnapshots(db: Db): Promise<OwnerReportRoomSnapshot[]> {
    const docs = await db.collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION).find({}).toArray();
    return docs.map((doc) => ({
        ownerId: String(doc.ownerId ?? ''),
        reportMonth: String(doc.reportMonth ?? ''),
        objectId: Number(doc.objectId),
        roomKey: String(doc.roomKey ?? ''),
        locale: String(doc.locale ?? ''),
        roomSection: (doc.roomSection as OwnerReportRoomSnapshot['roomSection']) ?? null,
        checkPassed: Boolean(doc.checkPassed),
        roomTotal: Number(doc.roomTotal ?? 0),
        settlementSum: Number(doc.settlementSum ?? 0),
        reportVersion: storedReportVersion(doc.reportVersion),
    }));
}

export function overlayOwnerReportSnapshots(
    payload: CommissionOwnerViewStoredPayload,
    snapshots: OwnerReportRoomSnapshot[]
): CommissionOwnerViewStoredPayload {
    const relevant = snapshots.filter(
        (snapshot) => snapshot.reportMonth === payload.monthKey && snapshot.locale === payload.language
    );
    if (relevant.length === 0) return payload;
    return payloadWithRoomSections(payload, applyRoomSnapshots(payload.roomSections, relevant));
}

export type EnsureOwnerReportSnapshotsResult = {
    saved: number;
    skipped: number;
    rechecked: number;
};

export type SaveClosedPeriodReportsResult = {
    months: number;
    rooms: number;
    saved: number;
    skipped: number;
    rechecked: number;
};

function addRoomPeriod(target: Map<string, RoomPeriodInput[]>, reportMonth: string, room: RoomPeriodInput) {
    const list = target.get(reportMonth) ?? [];
    if (!list.some((item) => item.objectId === room.objectId && item.roomKey === room.roomKey)) {
        list.push(room);
    }
    target.set(reportMonth, list);
}

/** Формирует и сохраняет недостающие отчёты по всем уже закрытым периодам. */
export async function saveReportsForAllClosedPeriods(
    db: Db,
    savedBy: string
): Promise<SaveClosedPeriodReportsResult> {
    const closed = await getClosedPeriodsData(db);
    const byMonth = new Map<string, RoomPeriodInput[]>();

    for (const period of closed.roomPeriods) {
        addRoomPeriod(byMonth, period.reportMonth, {
            objectId: period.objectId,
            roomKey: period.roomKey,
        });
    }

    if (closed.globalMonths.length > 0) {
        const objects = await getObjects();
        const allRooms: RoomPeriodInput[] = [];
        for (const object of objects) {
            for (const room of object.roomTypes ?? []) {
                const roomKey = stableAccountancyRoomLabel(room);
                if (!roomKey) continue;
                allRooms.push({ objectId: object.id, roomKey });
            }
        }
        for (const reportMonth of closed.globalMonths) {
            for (const room of allRooms) addRoomPeriod(byMonth, reportMonth, room);
        }
    }

    let saved = 0;
    let skipped = 0;
    let rechecked = 0;
    let rooms = 0;
    for (const [reportMonth, monthRooms] of byMonth) {
        rooms += monthRooms.length;
        const result = await ensureOwnerReportSnapshots(db, reportMonth, monthRooms, savedBy);
        saved += result.saved;
        skipped += result.skipped;
        rechecked += result.rechecked;
    }

    return { months: byMonth.size, rooms, saved, skipped, rechecked };
}

/**
 * Сохраняет недостающие снимки отчёта для уже зафиксированных комнат.
 * v1 и v2 пишутся отдельными документами и не перезаписывают друг друга.
 */
export async function ensureOwnerReportSnapshots(
    db: Db,
    reportMonth: string,
    rooms: RoomPeriodInput[],
    savedBy: string
): Promise<EnsureOwnerReportSnapshotsResult> {
    if (rooms.length === 0) return { saved: 0, skipped: 0, rechecked: 0 };

    await ensureSnapshotIndex(db);
    const collection = db.collection<SnapshotDoc>(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION);
    const existing = await collection
        .find({
            reportMonth,
            $or: rooms.map((room) => ({ objectId: room.objectId, roomKey: room.roomKey })),
        })
        .toArray();

    const bookingFetchers = cachedBookingFetchers(db);
    const [ownerDocs, objects, expenseDocs, incomeDocs, categoryDocs, ratesByBookingId] = await Promise.all([
        db.collection('users').find({ role: 'owner' }).toArray(),
        getObjects(),
        db.collection('expenses').find({}).toArray(),
        db.collection('incomes').find({}).toArray(),
        db.collection('accountancyCategories').find({}).sort({ parentId: 1, order: 1, name: 1 }).toArray(),
        loadAllCommissionRatesForMonth(db, reportMonth),
    ]);

    const owners = ownerDocs.map((doc) => mapDbUser(doc as Record<string, unknown>));
    const expenses = expenseDocs.map((doc) => ({
        ...(doc as unknown as Expense),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
        categoryId: normalizeMongoIdString((doc as { categoryId?: unknown }).categoryId) || undefined,
        parentExpenseId:
            normalizeMongoIdString((doc as { parentExpenseId?: unknown }).parentExpenseId) || undefined,
    }));
    const incomes = incomeDocs.map((doc) => ({
        ...(doc as unknown as Income),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
        categoryId: normalizeMongoIdString((doc as { categoryId?: unknown }).categoryId) || undefined,
        parentExpenseId:
            normalizeMongoIdString((doc as { parentExpenseId?: unknown }).parentExpenseId) || undefined,
    }));
    const categories = categoryDocs.map((doc) => ({
        ...(doc as unknown as AccountancyCategory),
        _id: normalizeMongoIdString((doc as { _id?: unknown })._id) || undefined,
    }));

    const now = new Date();
    let saved = 0;
    const skipped = 0;
    let rechecked = 0;
    const existingByIdentity = new Map(
        existing.map((doc) => {
            const version = storedReportVersion(doc.reportVersion) ?? 1;
            return [`${doc.ownerId}:${doc.objectId}:${doc.roomKey}:${doc.locale}:${version}`, doc];
        })
    );

    for (const owner of owners) {
        if (!owner._id) continue;
        const ownedRooms = rooms.filter((room) => ownerOwnsRoom(owner, room.objectId, room.roomKey, objects));
        if (ownedRooms.length === 0) continue;

        const payloads = await computeCommissionOwnerViewPayloads({
            owner,
            monthKey: reportMonth,
            locales: OWNER_REPORT_CHECK_LOCALES,
            objects,
            expenses,
            incomes,
            categories,
            bookingFetchers,
            ratesByBookingId,
        });

        for (const payload of payloads) {
            const locale = payload.language.startsWith('en') ? 'en-US' : 'ru-RU';
            for (const room of ownedRooms) {
                const sectionKey = ownerReportRoomSectionKey(room.objectId, room.roomKey);
                const freshSection = payload.roomSections.find((row) => row.key === sectionKey) ?? null;
                const emptySection: CommissionOwnerViewRoomSection = {
                    key: sectionKey,
                    title: room.roomKey,
                    incomeGroups: [],
                    expenseGroups: [],
                    totals: { totalIncome: 0, totalExpenses: 0, totalCommission: 0 },
                };

                for (const reportVersion of REPORT_VERSIONS) {
                    const identity = `${owner._id}:${room.objectId}:${room.roomKey}:${locale}:${reportVersion}`;
                    const savedDoc = existingByIdentity.get(identity);
                    const storedSection = savedDoc ? (savedDoc.roomSection ?? null) : freshSection;
                    const sectionForVersion = storedSection
                        ? reportVersion === 2
                            ? migrateOwnerViewRoomSectionToV2(storedSection)
                            : storedSection
                        : emptySection;
                    const checks = checkRoomEarningsAgainstSettlements(
                        [sectionForVersion],
                        payload.settlementRows,
                        reportMonth,
                        reportVersion
                    );
                    const check = checks[0];
                    if (savedDoc?._id) {
                        await collection.updateOne(
                            { _id: savedDoc._id },
                            {
                                $set: {
                                    checkPassed: check?.passed ?? true,
                                    roomTotal: check?.roomTotal ?? 0,
                                    settlementSum: check?.settlementSum ?? 0,
                                    reportVersion: storedReportVersion(savedDoc.reportVersion) ?? reportVersion,
                                },
                            }
                        );
                        rechecked += 1;
                        continue;
                    }

                    const sectionToSave = freshSection
                        ? cloneSection(
                              reportVersion === 2
                                  ? migrateOwnerViewRoomSectionToV2(freshSection)
                                  : freshSection
                          )
                        : null;
                    const doc: SnapshotDoc = {
                        ownerId: owner._id,
                        reportMonth,
                        objectId: room.objectId,
                        roomKey: room.roomKey,
                        locale,
                        roomSection: sectionToSave,
                        checkPassed: check?.passed ?? true,
                        roomTotal: check?.roomTotal ?? 0,
                        settlementSum: check?.settlementSum ?? 0,
                        reportVersion,
                        savedAt: now,
                        savedBy,
                    };
                    await collection.insertOne(doc);
                    saved += 1;
                }
            }
        }
    }

    return { saved, skipped, rechecked };
}

export type MigrateOwnerReportSnapshotsToV2Result = {
    scanned: number;
    updated: number;
    skipped: number;
};

/**
 * Для снимков v1 создаёт отдельный документ v2.
 * Тело снимка v1 не меняется.
 */
export async function migrateOwnerReportSnapshotsToV2(
    db?: Db
): Promise<MigrateOwnerReportSnapshotsToV2Result> {
    const database = db ?? (await getDB());
    await ensureSnapshotIndex(database);
    const collection = database.collection(ACCOUNTANCY_REPORT_SNAPSHOTS_COLLECTION);
    const docs = await collection.find({}).toArray();

    let updated = 0;
    let skipped = 0;

    for (const doc of docs) {
        if (storedReportVersion(doc.reportVersion) === 2) {
            skipped += 1;
            continue;
        }

        if (storedReportVersion(doc.reportVersion) !== 1) {
            await collection.updateOne({ _id: doc._id }, { $set: { reportVersion: 1 } });
        }

        const v2Exists = await collection.findOne({
            ownerId: doc.ownerId,
            reportMonth: doc.reportMonth,
            objectId: doc.objectId,
            roomKey: doc.roomKey,
            locale: doc.locale,
            reportVersion: 2,
        });
        if (v2Exists) {
            skipped += 1;
            continue;
        }

        const rawSection = (doc.roomSection as CommissionOwnerViewRoomSection | null) ?? null;
        const nextSection = rawSection ? migrateOwnerViewRoomSectionToV2(cloneSection(rawSection)) : null;
        const roomTotal = nextSection ? computeOwnerViewV2RoomTotal(nextSection) : 0;

        await collection.insertOne({
            ownerId: doc.ownerId,
            reportMonth: doc.reportMonth,
            objectId: doc.objectId,
            roomKey: doc.roomKey,
            locale: doc.locale,
            roomSection: nextSection,
            checkPassed: Boolean(doc.checkPassed),
            roomTotal,
            settlementSum: Number(doc.settlementSum ?? 0),
            reportVersion: 2,
            savedAt: doc.savedAt instanceof Date ? doc.savedAt : new Date(),
            savedBy: String(doc.savedBy ?? ''),
        });
        updated += 1;
    }

    return { scanned: docs.length, updated, skipped };
}
