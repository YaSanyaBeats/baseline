import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { ObjectId } from 'mongodb';
import { getAllObjects, getObjects } from '@/lib/server/getObjects';

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const collection = db.collection('objects');
        const searchParams = request.nextUrl.searchParams;
        
        // Обработка запроса по массиву ID
        if (searchParams.has('id[]')) {
            const ids = searchParams.getAll('id[]');
            const idsNumbers = ids.map((e) => +e);
            
            const objects = await collection.find({
                id: { $in: idsNumbers }
            }).toArray();
            
            return NextResponse.json(objects);
        }
        
        // Обработка запроса всех объектов
        if (searchParams.get('all') === 'true') {
            const neededObjects = await getAllObjects();
            return NextResponse.json(neededObjects);
        }
        
        // Обработка запроса по userID
        if (searchParams.has('userID')) {
            const users = db.collection('users');
            const user = await users.findOne({
                '_id': new ObjectId(searchParams.get('userID') as string)
            });
            
            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }
            
            const objectInfo = user.objects;
            const idsNumbers = objectInfo.map((e: any) => +e.id);
            
            const objects = await collection.find({
                id: { $in: idsNumbers }
            }).toArray();
            
            const neededObjects = objects.map((object: any) => {
                let rooms = [];
                
                if (object?.roomTypes?.length) {
                    rooms = object?.roomTypes[0]?.units.map((room: any) => {
                        return {
                            id: room?.id,
                            name: room?.name,
                        };
                    });
                }
                
                rooms = rooms.filter((room: any) => {
                    const neededObject = objectInfo.find((innerObject: any) => {
                        return innerObject.id == object.id;
                    });
                    
                    return neededObject?.rooms.includes(room.id);
                });
                
                return {
                    id: object.id,
                    name: object.name,
                    roomTypes: rooms
                };
            });
            
            return NextResponse.json(neededObjects);
        }
        
        // Обычный запрос с фильтрацией
        const neededObjects = await getObjects();
        return NextResponse.json(neededObjects);
    } catch (error) {
        console.error('Error in GET /api/objects:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
