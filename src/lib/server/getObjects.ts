import { getDB } from "../db/getDB";

export async function getObjects() {
    const db = await getDB();
    const collection = db.collection('objects');
    const optionsDB = db.collection('options');
    const usersCollection = db.collection('users');

    const optionsData = await optionsDB.find({}).toArray();
    const options: any = {};
    optionsData.forEach((prop) => {
        options[prop['optionName']] = prop['value'];
    });
    
    const objects = await collection.find({}).sort({ name: 1 }).toArray();

    // Получаем всех пользователей с их объектами один раз,
    // чтобы потом собрать список пользователей, у которых есть доступ к каждому объекту
    const users = await usersCollection.find({}, {
        projection: {
            name: 1,
            login: 1,
            objects: 1,
        },
    }).toArray();
    
    const neededObjects = objects.map((object: any) => {
        let rooms = [];
        
        if (object?.roomTypes?.length) {
            rooms = object?.roomTypes[0]?.units.map((room: any) => {
                // Список пользователей, у которых есть доступ именно к этой комнате
                const roomAccessUsers = users
                    .filter((user: any) => {
                        if (!Array.isArray(user.objects)) return false;
                        const userObject = user.objects.find((uo: any) => +uo.id === object.id);
                        if (!userObject) return false;
                        // Проверяем, есть ли доступ к этой конкретной комнате
                        return Array.isArray(userObject.rooms) && userObject.rooms.includes(room?.id);
                    })
                    .map((user: any) => user.name || user.login);

                return {
                    id: room?.id,
                    name: room?.name,
                    accessUsers: roomAccessUsers,
                }
            })
        }

        return {
            id: object.id,
            name: object.name,
            roomTypes: rooms,
        }
    })

    const result = neededObjects.filter((object) => {
        if (object.name.includes(options.excludeSubstr)) {
            return false;
        }

        if (options.excludeObjects?.includes(object.id)) {
            return false;
        }

        return true;
    })

    return result;
}

export async function getAllObjects() {
    const db = await getDB();
    const collection = db.collection('objects');
    const usersCollection = db.collection('users');

    const objects = await collection.find({}).sort({ name: 1 }).toArray();

    const users = await usersCollection.find({}, {
        projection: {
            name: 1,
            login: 1,
            objects: 1,
        },
    }).toArray();

    const neededObjects = objects.map((object: any) => {
        return {
            id: object.id,
            name: object.name,
            roomTypes: object.roomTypes[0].units.map((room: any) => {
                // Список пользователей, у которых есть доступ именно к этой комнате
                const roomAccessUsers = users
                    .filter((user: any) => {
                        if (!Array.isArray(user.objects)) return false;
                        const userObject = user.objects.find((uo: any) => +uo.id === object.id);
                        if (!userObject) return false;
                        // Проверяем, есть ли доступ к этой конкретной комнате
                        return Array.isArray(userObject.rooms) && userObject.rooms.includes(room.id);
                    })
                    .map((user: any) => user.name || user.login);

                return {
                    id: room.id,
                    name: room.name,
                    accessUsers: roomAccessUsers,
                }
            }),
        }
    })

    return neededObjects;
}

