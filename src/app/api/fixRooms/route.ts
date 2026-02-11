import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { getObjects } from '@/lib/server/getObjects';

/**
 * Одноразовая миграция: привязывает существующие расходы и доходы без roomId
 * к первой комнате соответствующего объекта.
 *
 * GET /api/fixRooms
 */
export async function GET() {
    try {
        const db = await getDB();
        const objects = await getObjects();

        // Строим карту objectId -> первая комната
        const objectFirstRoom: Record<number, number> = {};
        for (const obj of objects) {
            if (obj.roomTypes && obj.roomTypes.length > 0) {
                objectFirstRoom[obj.id] = obj.roomTypes[0].id;
            }
        }

        const expensesCollection = db.collection('expenses');
        const incomesCollection = db.collection('incomes');

        // Обновляем расходы без roomId
        const expensesWithoutRoom = await expensesCollection
            .find({ $or: [{ roomId: null }, { roomId: { $exists: false } }] })
            .toArray();

        let expensesUpdated = 0;
        let expensesSkipped = 0;

        for (const expense of expensesWithoutRoom) {
            const firstRoomId = objectFirstRoom[expense.objectId];
            if (firstRoomId != null) {
                await expensesCollection.updateOne(
                    { _id: expense._id },
                    { $set: { roomId: firstRoomId } },
                );
                expensesUpdated++;
            } else {
                expensesSkipped++;
            }
        }

        // Обновляем доходы без roomId
        const incomesWithoutRoom = await incomesCollection
            .find({ $or: [{ roomId: null }, { roomId: { $exists: false } }] })
            .toArray();

        let incomesUpdated = 0;
        let incomesSkipped = 0;

        for (const income of incomesWithoutRoom) {
            const firstRoomId = objectFirstRoom[income.objectId];
            if (firstRoomId != null) {
                await incomesCollection.updateOne(
                    { _id: income._id },
                    { $set: { roomId: firstRoomId } },
                );
                incomesUpdated++;
            } else {
                incomesSkipped++;
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Миграция завершена',
            expenses: {
                total: expensesWithoutRoom.length,
                updated: expensesUpdated,
                skipped: expensesSkipped,
            },
            incomes: {
                total: incomesWithoutRoom.length,
                updated: incomesUpdated,
                skipped: incomesSkipped,
            },
        });
    } catch (error) {
        console.error('Error in GET /api/fixRooms:', error);
        return NextResponse.json(
            { success: false, message: 'Ошибка миграции' },
            { status: 500 },
        );
    }
}
