import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';

async function getBusynessPerRoom(propertyId: number, room: any, roomTypeId: number) {
    const db = await getDB();
    const bookings = db.collection('bookings');
    
    // Получаем текущую дату
    const now = new Date();
    now.setDate(1);

    // 12 месяцев назад
    const startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 12);

    // 3 месяца вперёд
    const endDate = new Date(now);
    endDate.setMonth(now.getMonth() + 4);
    endDate.setDate(endDate.getDate() - 1);

    const neededBookings = await bookings.find({
        propertyId: +propertyId,
        unitId: +room.id,
        /** Тип номера (Beds24 room / listing): при совпадающих unitId у разных roomType иначе возвращаются чужие брони. */
        $or: [{ roomId: roomTypeId }, { roomID: roomTypeId }],
        status: { $nin: ['inquiry'] },
        $and: [
            { arrival: { $lte: endDate.toISOString().split('T')[0] } },
            { departure: { $gte: startDate.toISOString().split('T')[0] } }
        ]
    }).toArray();

    const bookingsList = neededBookings.map((booking: any) => {
        // Вычисляем стоимость из invoiceItems
        let price = 0;
        if (booking?.invoiceItems?.length) {
            booking.invoiceItems.forEach((invoiceElem: any) => {
                if (invoiceElem.type == 'charge' && invoiceElem.lineTotal > price) {
                    price = invoiceElem.lineTotal;
                }
            });
        }

        // Вычисляем количество гостей
        let guestsCount = 0;
        if (booking?.numAdult) {
            guestsCount += booking?.numAdult;
        }
        if (booking?.numChild) {
            guestsCount += booking?.numChild;
        }

        return {
            id: booking.id,
            title: booking.title || '',
            firstName: booking.firstName || '',
            lastName: booking.lastName || '',
            status: booking.status || '',
            arrival: booking.arrival,
            departure: booking.departure,
            price: price,
            guestsCount: guestsCount
        };
    });

    return {
        roomID: room.id,
        roomName: room.name ? room.name : room.id,
        bookings: bookingsList
    };
}

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;
        
        const objectID = searchParams.get('objectID');
        const userID = searchParams.get('userID');
        const objects = db.collection('objects');
        const internalObjectsCollection = db.collection('internalObjects');

        if (!objectID) {
            return NextResponse.json({ error: 'Missing objectID parameter' }, { status: 400 });
        }

        // Сначала ищем все объекты, содержащие roomType с указанным ID
        let allObjects = await objects.find({}).toArray();
        
        if (!allObjects || allObjects.length === 0) {
            allObjects = await internalObjectsCollection.find({}).toArray();
        }

        // Находим property, содержащий roomType с нужным ID
        let propertyId: number | null = null;
        let roomType: any = null;
        
        for (const obj of allObjects) {
            const foundRoomType = obj.roomTypes?.find((rt: any) => rt.id === +objectID);
            if (foundRoomType) {
                propertyId = obj.id;
                roomType = foundRoomType;
                break;
            }
        }

        if (!roomType || propertyId === null) {
            return NextResponse.json({ error: 'RoomType not found' }, { status: 404 });
        }

        // Собираем комнаты из найденного roomType
        let rooms = roomType?.units || [];
        
        if (userID) {
            const users = db.collection('users');
            const user = await users.findOne({
                '_id': new ObjectId(userID)
            });
            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            const userObject = user.objects.find((userObject: any) => {
                return userObject.id == objectID;
            });
            
            if (userObject) {
                rooms = rooms.filter((room: any) => {
                    return userObject.rooms.includes(room.id);
                });
            }
        }

        const roomTypeIdNum = Number(objectID);
        const result = await Promise.all(rooms.map((room: any) => {
            return getBusynessPerRoom(propertyId!, room, roomTypeIdNum);
        }));

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in GET /api/bysuness:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
