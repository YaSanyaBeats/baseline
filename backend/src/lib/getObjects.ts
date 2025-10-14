import db from "../db/getDB";

export async function getObjects() {
    const collection = db.collection('objects');
    const optionsDB = db.collection('options');

    const optionsData = await optionsDB.find({}).toArray();
    let options: any = {};
    optionsData.forEach((prop) => {
        options[prop['optionName']] = prop['value'];
    });
    
    let objects = await collection.find({}).sort({name: 1}).toArray();
    const neededObjects = objects.map((object: any) => {
        return {
            id: object.id,
            name: object.name,
            roomTypes: object.roomTypes[0].units.map((room: any) => {
                return {
                    id: room.id,
                    name: room.name,
                }
            })
        }
    })

    const result = neededObjects.filter((object) => {
        return !object.name.includes(options.excludeSubstr);
    })

    return result;
}

export async function getAllObjects() {
    const collection = db.collection('objects');
    
    let objects = await collection.find({}).toArray();
    const neededObjects = objects.map((object: any) => {
        return {
            id: object.id,
            name: object.name,
            roomTypes: object.roomTypes[0].units.map((room: any) => {
                return {
                    id: room.id,
                    name: room.name,
                }
            })
        }
    })

    return neededObjects;
}