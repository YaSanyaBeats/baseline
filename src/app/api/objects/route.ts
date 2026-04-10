import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import {
    buildClientObjectRows,
    filterClientRowsByUserAssignments,
    getAllObjects,
    getObjects,
} from '@/lib/server/getObjects';
import { getAllObjectMetadata, getAllRoomMetadata } from '@/lib/server/objectRoomMetadata';

function hasFullAccess(session: { user?: unknown } | null): boolean {
    if (!session?.user) return false;
    const role = (session.user as { role?: string }).role;
    const hasCashflow = Boolean((session.user as { hasCashflow?: boolean }).hasCashflow);
    return role === 'admin' || role === 'accountant' || hasCashflow;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const fullAccess = hasFullAccess(session);
        const userId = (session.user as any)._id?.toString?.() ?? (session.user as any)._id;

        const db = await getDB();
        const collection = db.collection('objects');
        const internalObjectsCollection = db.collection('internalObjects');
        const searchParams = request.nextUrl.searchParams;

        // Обработка запроса по массиву ID
        if (searchParams.has('id[]')) {
            if (!fullAccess) {
                return NextResponse.json(
                    { success: false, message: 'Недостаточно прав. Доступ ко всем объектам есть у администратора, бухгалтера или пользователя с кешфлоу.' },
                    { status: 403 },
                );
            }
            const ids = searchParams.getAll('id[]');
            const idsNumbers = ids.map((e) => +e);
            
            // Ищем в обеих коллекциях
            const beds24Objects = await collection.find({
                id: { $in: idsNumbers }
            }).toArray();
            
            const internalObjects = await internalObjectsCollection.find({
                id: { $in: idsNumbers }
            }).toArray();
            
            const objects = [...internalObjects, ...beds24Objects];
            
            return NextResponse.json(objects);
        }
        
        // Обработка запроса всех объектов
        if (searchParams.get('all') === 'true') {
            if (!fullAccess) {
                return NextResponse.json(
                    { success: false, message: 'Недостаточно прав. Доступ ко всем объектам есть у администратора, бухгалтера или пользователя с кешфлоу.' },
                    { status: 403 },
                );
            }
            const neededObjects = await getAllObjects();
            return NextResponse.json(neededObjects);
        }

        // Обработка запроса по userID
        if (searchParams.has('userID')) {
            const requestedUserID = searchParams.get('userID');
            if (!fullAccess && requestedUserID !== userId) {
                return NextResponse.json(
                    { success: false, message: 'Недостаточно прав. Можно запрашивать только свои объекты.' },
                    { status: 403 },
                );
            }
            const users = db.collection('users');
            const user = await users.findOne({
                '_id': new ObjectId(requestedUserID as string)
            });
            
            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            
            const objectInfo = user.objects;
            const idsNumbers = objectInfo.map((e: any) => +e.id);

            const idQuery = {
                $or: [{ id: { $in: idsNumbers } }, { 'roomTypes.id': { $in: idsNumbers } }],
            };

            const beds24Objects = await collection.find(idQuery).toArray();
            const internalObjects = await internalObjectsCollection.find(idQuery).toArray();

            const dedupeByPropertyId = (arr: any[]) => {
                const m = new Map<number, any>();
                for (const o of arr) {
                    if (o?.id != null && !m.has(o.id)) m.set(o.id, o);
                }
                return Array.from(m.values());
            };

            const rawObjects = [...dedupeByPropertyId(internalObjects), ...dedupeByPropertyId(beds24Objects)];

            const allUsers = await db.collection('users').find(
                {},
                { projection: { name: 1, login: 1, objects: 1 } }
            ).toArray();

            const [objectMetadataMap, roomMetadataMap] = await Promise.all([
                getAllObjectMetadata(),
                getAllRoomMetadata(),
            ]);

            const rows = buildClientObjectRows(rawObjects, allUsers, objectMetadataMap, roomMetadataMap);
            const neededObjects = filterClientRowsByUserAssignments(rows, objectInfo);

            return NextResponse.json(neededObjects);
        }
        
        // Обычный запрос с фильтрацией (все объекты)
        if (!fullAccess) {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Доступ ко всем объектам есть у администратора, бухгалтера или пользователя с кешфлоу.' },
                { status: 403 },
            );
        }
        const neededObjects = await getObjects();
        return NextResponse.json(neededObjects);
    } catch (error) {
        console.error('Error in GET /api/objects:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
