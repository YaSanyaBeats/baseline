import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';

export async function GET() {
    try {
        const db = await getDB();
        const options = db.collection('options');
        const objectsCollection = db.collection('objects');
        const optionsData = await options.find({}).toArray();

        const result: any = {};

        optionsData.forEach((prop) => {
            if (prop['optionName'] === 'excludeObjects') {
                result[prop['optionName']] = prop['value'];
            }
            result[prop['optionName']] = prop['value'];
        });

        const objects = await objectsCollection.find({
            id: { $in: result['excludeObjects'] },
        }).toArray();

        const neededObjects = objects.map((object: any) => {
            return {
                id: object.id,
                name: object.name,
                roomTypes: object.roomTypes[0].units.map((room: any) => {
                    return {
                        id: room.id,
                        name: room.name,
                    };
                })
            };
        });

        result['excludeObjects'] = neededObjects;

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in GET /api/options:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const db = await getDB();
        const options = db.collection('options');
        const body = await request.json();
        const params = body.params || body;

        for (const param in params) {
            await options.updateOne(
                { optionName: param },
                { $set: { 'value': params[param] } },
                { upsert: true }
            );
        }

        return NextResponse.json({ success: true, message: "success" });
    } catch (error) {
        console.error('Error in POST /api/options:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
