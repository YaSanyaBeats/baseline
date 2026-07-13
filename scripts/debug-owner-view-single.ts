import { ObjectId } from 'mongodb';
import { getDB } from '../src/lib/db/getDB';
import { getObjects } from '../src/lib/server/getObjects';
import { computeCommissionOwnerViewPayload } from '../src/lib/commissionOwnerViewCore';
import { getBookingsByIdsFromDb, searchBookingsFromDb } from '../src/lib/server/bookingsQuery';
import { calculateCommissionForObject } from '../src/lib/commissionForObject';
import { filterObjectsForOwner } from '../src/lib/ownerObjectsFilter';
import { buildOwnerViewExpenseGroupsForRoom } from '../src/lib/ownerViewExpenses';
import { buildCategoryNameByIdMap } from '../src/lib/accountancyCategoryResolve';

const ownerId = '692ae4e8cce62ee0cda54662';
const monthKey = '2026-05';
const bookingId = 84588916;

async function main() {
const db = await getDB();
const ownerDoc = await db.collection('users').findOne({ _id: new ObjectId(ownerId), role: 'owner' });
if (!ownerDoc) throw new Error('owner not found');

const owner = { ...ownerDoc, _id: ownerDoc._id.toString() };
const objects = await getObjects();
const ownerObjects = filterObjectsForOwner(objects, owner.objects ?? []);
const expenses = (await db.collection('expenses').find({}).toArray()) as any[];
const incomes = (await db.collection('incomes').find({}).toArray()) as any[];
const categories = (await db.collection('accountancyCategories').find({}).toArray()) as any[];

const fetchers = {
    searchBookings: (p: any) => searchBookingsFromDb(db, p),
    getBookingsByIds: (ids: number[]) => getBookingsByIdsFromDb(db, ids),
};

const targetExpense = expenses.find((e) => e.bookingId === bookingId && e.reportMonth === monthKey);
console.log('target expense:', targetExpense ? {
    objectId: targetExpense.objectId,
    roomName: targetExpense.roomName,
    categoryId: targetExpense.categoryId,
    amount: targetExpense.amount,
} : null);

const obj249834 = ownerObjects.find((o) => o.id === 249834);
console.log('owner object 249834 rooms:', obj249834?.roomTypes?.map((r) => ({ id: r.id, name: r.name })));

if (obj249834) {
    const report = await calculateCommissionForObject(obj249834, monthKey, incomes, expenses, categories, fetchers);
    const inReport = report.bookingsReport.some((b) => b.booking.id === bookingId);
    console.log('booking in bookingsReport:', inReport);
    console.log('bookingsReport count:', report.bookingsReport.length);
    console.log('bookingsReport ids sample:', report.bookingsReport.map((b) => b.booking.id).slice(0, 10));
    if (inReport) {
        const row = report.bookingsReport.find((b) => b.booking.id === bookingId)!;
        console.log('booking unitId:', row.booking.unitId, 'arrival:', row.booking.arrival, 'departure:', row.booking.departure);
        console.log('expenses in report row:', row.expenses.map((e) => ({ cat: e.category, amount: e.amount, reportMonth: e.reportMonth })));
    }
}

const payload = await computeCommissionOwnerViewPayload({
    owner,
    monthKey,
    locale: 'ru-RU',
    objects,
    expenses,
    incomes,
    categories,
    bookingFetchers: fetchers,
});

if (!payload) {
    console.log('payload is null');
    process.exit(0);
}

console.log('room sections:', payload.roomSections.map((s) => s.title));
for (const section of payload.roomSections) {
    for (const g of section.expenseGroups) {
        for (const line of g.lines) {
            if (line.description.includes('Комиссия') || line.isManagementCommission) {
                console.log('FOUND', section.title, g.label, line.description, line.lineTotal);
            }
        }
    }
}

const section604 = payload.roomSections.find((s) => s.title.includes('604'));
console.log('section 604:', section604 ? {
    title: section604.title,
    expenseGroups: section604.expenseGroups.map((g) => ({
        kind: g.kind,
        label: g.label,
        lines: g.lines.map((l) => ({ desc: l.description, total: l.lineTotal, mgmt: l.isManagementCommission })),
    })),
} : 'NOT FOUND');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
