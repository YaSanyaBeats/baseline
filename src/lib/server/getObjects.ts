import { ObjectId } from "mongodb";
import { getDB } from "../db/getDB";
import { getInternalObjects } from "./internalObjects";
import { getAllObjectMetadata, getAllRoomMetadata } from "./objectRoomMetadata";

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
    
    // Загружаем объекты из Beds24
    const beds24Objects = await collection.find({}).sort({ name: 1 }).toArray();
    
    // Загружаем внутренние объекты (Компания и т.д.)
    const internalObjectsRaw = await getInternalObjects();
    
    // Объединяем оба списка: сначала внутренние, потом Beds24
    const objects = [...internalObjectsRaw, ...beds24Objects];

    // Получаем всех пользователей с их объектами один раз,
    // чтобы потом собрать список пользователей, у которых есть доступ к каждому объекту
    const users = await usersCollection.find({}, {
        projection: {
            name: 1,
            login: 1,
            objects: 1,
        },
    }).toArray();

    // Загружаем метаданные из отдельной коллекции (не стирается при синхронизации)
    const [objectMetadataMap, roomMetadataMap] = await Promise.all([
        getAllObjectMetadata(),
        getAllRoomMetadata(),
    ]);
    
    const neededObjects = objects.map((object: any) => {
        const objMeta = objectMetadataMap[object.id];
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

                const roomMeta = roomMetadataMap[`${object.id}_${room?.id}`];
                return {
                    id: room?.id,
                    name: room?.name,
                    accessUsers: roomAccessUsers,
                    ...(roomMeta && {
                        bedrooms: roomMeta.bedrooms,
                        bathrooms: roomMeta.bathrooms,
                        livingRoomSofas: roomMeta.livingRoomSofas,
                        kitchen: roomMeta.kitchen,
                        level: roomMeta.level,
                        commissionSchemeId: roomMeta.commissionSchemeId,
                        internetCostPerMonth: roomMeta.internetCostPerMonth,
                    }),
                }
            })
        }

        return {
            id: object.id,
            name: object.name,
            roomTypes: rooms,
            ...(objMeta && {
                district: objMeta.district,
                objectType: objMeta.objectType,
            }),
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

/** Проверка: полный доступ ко всем объектам (admin, accountant или hasCashflow). */
function hasFullObjectsAccess(session: { user?: { role?: string; hasCashflow?: boolean } | null }) {
    if (!session?.user) return false;
    const role = (session.user as any).role;
    const hasCashflow = Boolean((session.user as any).hasCashflow);
    return role === 'admin' || role === 'accountant' || hasCashflow;
}

/** Фильтрует список объектов по доступу пользователя (user.objects). */
function filterObjectsByUserObjects(
    objects: { id: number; name: string; roomTypes: { id: number; name: string; [k: string]: unknown }[]; [k: string]: unknown }[],
    userObjects: { id: number; rooms: number[] }[]
): typeof objects {
    if (!Array.isArray(userObjects) || userObjects.length === 0) return [];
    const idSet = new Set(userObjects.map((uo) => uo.id));
    return objects
        .filter((obj) => idSet.has(obj.id))
        .map((obj) => {
            const uo = userObjects.find((o) => o.id === obj.id);
            const roomIds = uo && Array.isArray(uo.rooms) ? new Set(uo.rooms) : new Set<number>();
            const roomTypes = (obj.roomTypes || []).filter((r: { id: number }) => roomIds.has(r.id));
            return { ...obj, roomTypes };
        });
}

/**
 * Возвращает объекты с учётом сессии: все для admin/accountant/hasCashflow,
 * только свои для владельца без кешфлоу. Для вызова из серверного layout (без HTTP).
 */
export async function getObjectsForSession(session: any) {
    const all = await getObjects();
    if (hasFullObjectsAccess(session)) return all;
    let userObjects = session?.user?.objects;
    if (!userObjects || !Array.isArray(userObjects)) {
        const userId = session?.user?._id;
        if (userId) {
            const db = await getDB();
            const user = await db.collection('users').findOne(
                { _id: new ObjectId(userId) },
                { projection: { objects: 1 } }
            );
            userObjects = user?.objects;
        }
    }
    if (!userObjects || !Array.isArray(userObjects)) return all;
    return filterObjectsByUserObjects(all, userObjects);
}

export async function getAllObjects() {
    const db = await getDB();
    const collection = db.collection('objects');
    const usersCollection = db.collection('users');

    // Загружаем объекты из Beds24
    const beds24Objects = await collection.find({}).sort({ name: 1 }).toArray();
    
    // Загружаем внутренние объекты (Компания и т.д.)
    const internalObjectsRaw = await getInternalObjects();
    
    // Объединяем оба списка: сначала внутренние, потом Beds24
    const objects = [...internalObjectsRaw, ...beds24Objects];

    const users = await usersCollection.find({}, {
        projection: {
            name: 1,
            login: 1,
            objects: 1,
        },
    }).toArray();

    const [objectMetadataMap, roomMetadataMap] = await Promise.all([
        getAllObjectMetadata(),
        getAllRoomMetadata(),
    ]);

    const neededObjects = objects.map((object: any) => {
        const objMeta = objectMetadataMap[object.id];
        return {
            id: object.id,
            name: object.name,
            roomTypes: (object.roomTypes?.[0]?.units || []).map((room: any) => {
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

                const roomMeta = roomMetadataMap[`${object.id}_${room.id}`];
                return {
                    id: room.id,
                    name: room.name,
                    accessUsers: roomAccessUsers,
                    ...(roomMeta && {
                        bedrooms: roomMeta.bedrooms,
                        bathrooms: roomMeta.bathrooms,
                        livingRoomSofas: roomMeta.livingRoomSofas,
                        kitchen: roomMeta.kitchen,
                        level: roomMeta.level,
                        commissionSchemeId: roomMeta.commissionSchemeId,
                        internetCostPerMonth: roomMeta.internetCostPerMonth,
                    }),
                }
            }),
            ...(objMeta && {
                district: objMeta.district,
                objectType: objMeta.objectType,
            }),
        }
    })

    return neededObjects;
}

