import { ObjectId } from "mongodb";
import { getDB } from "../db/getDB";
import { getInternalObjects } from "./internalObjects";
import { getAllObjectMetadata, getAllRoomMetadata } from "./objectRoomMetadata";
import type { ObjectType } from "../types";

/** Внутренние объекты (id < 0) и документы без id у roomType — одна строка; Beds24 с roomType.id — по строке на каждый roomType. */
export function shouldExpandToRoomTypesPerRawObject(object: any): boolean {
    if (object?.id == null || object.id < 0) return false;
    if (!Array.isArray(object.roomTypes) || object.roomTypes.length === 0) return false;
    return object.roomTypes.every((rt: any) => rt != null && typeof rt.id === "number");
}

export type ClientObjectRow = {
    id: number;
    name: string;
    propertyId: number;
    propertyName: string;
    roomTypes: any[];
    district?: string;
    objectType?: ObjectType;
};

/**
 * ID, по которым в user.objects ищется доступ к комнатам одного property.
 * После миграции property → roomTypes[0].id у пользователя может остаться только id первого roomType,
 * при этом в UI строки есть и для остальных roomType — без этого «Кто имеет доступ» пустой.
 * Старые записи с id = propertyId тоже учитываем.
 */
function collectUserAssignmentIdsForRawObject(object: any): number[] {
    const ids = new Set<number>();
    const pid = object?.id;
    if (typeof pid === 'number') ids.add(pid);
    for (const rt of object?.roomTypes || []) {
        if (rt != null && typeof rt.id === 'number') ids.add(rt.id);
    }
    return [...ids];
}

function mapRoomsForProperty(
    propertyId: number,
    logicalObjectIdForUsers: number,
    units: any[],
    users: any[],
    roomMetadataMap: Record<string, any>,
    userAssignmentIds: number[]
) {
    const assignmentSet = new Set(userAssignmentIds);
    return (units || []).map((room: any) => {
        const roomAccessUsers = users
            .filter((user: any) => {
                if (!Array.isArray(user.objects)) return false;
                return user.objects.some(
                    (uo: any) =>
                        assignmentSet.has(+uo.id) &&
                        Array.isArray(uo.rooms) &&
                        uo.rooms.includes(room?.id)
                );
            })
            .map((user: any) => user.name || user.login);

        const metaKey = `${propertyId}_${room?.id}`;
        const roomMeta =
            roomMetadataMap[metaKey] ??
            (logicalObjectIdForUsers !== propertyId
                ? roomMetadataMap[`${logicalObjectIdForUsers}_${room?.id}`]
                : undefined);
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
        };
    });
}

export function buildClientObjectRows(
    rawObjects: any[],
    users: any[],
    objectMetadataMap: Record<number, any>,
    roomMetadataMap: Record<string, any>
): ClientObjectRow[] {
    return rawObjects.flatMap((object: any) => {
        const propertyId = object.id;
        const objMeta = objectMetadataMap[propertyId];
        const propName = object.name ?? "";

        if (!object?.roomTypes?.length) {
            return [
                {
                    id: propertyId,
                    name: propName || `Object ${propertyId}`,
                    propertyId,
                    propertyName: propName || `Object ${propertyId}`,
                    roomTypes: [],
                    ...(objMeta && {
                        district: objMeta.district,
                        objectType: objMeta.objectType,
                    }),
                },
            ];
        }

        if (!shouldExpandToRoomTypesPerRawObject(object)) {
            const userAssignmentIds = collectUserAssignmentIdsForRawObject(object);
            const rooms = object.roomTypes.flatMap((rt: any) =>
                mapRoomsForProperty(propertyId, propertyId, rt?.units || [], users, roomMetadataMap, userAssignmentIds)
            );
            return [
                {
                    id: propertyId,
                    name: propName || `Object ${propertyId}`,
                    propertyId,
                    propertyName: propName || `Object ${propertyId}`,
                    roomTypes: rooms,
                    ...(objMeta && {
                        district: objMeta.district,
                        objectType: objMeta.objectType,
                    }),
                },
            ];
        }

        const userAssignmentIds = collectUserAssignmentIdsForRawObject(object);
        return object.roomTypes.map((roomType: any) => {
            const logicalId = roomType.id;
            const rooms = mapRoomsForProperty(
                propertyId,
                logicalId,
                roomType?.units || [],
                users,
                roomMetadataMap,
                userAssignmentIds
            );
            return {
                id: logicalId,
                name: roomType.name || `Object ${logicalId}`,
                propertyId,
                propertyName: propName,
                roomTypes: rooms,
                ...(objMeta && {
                    district: objMeta.district,
                    objectType: objMeta.objectType,
                }),
            };
        });
    });
}

/** Фильтрация строк для эндпоинта «объекты пользователя» (по записи user.objects). */
export function filterClientRowsByUserAssignments(
    rows: ClientObjectRow[],
    objectInfo: { id: number; rooms: number[] }[]
): ClientObjectRow[] {
    if (!Array.isArray(objectInfo) || objectInfo.length === 0) return [];
    return rows
        .map((row) => {
            const oi =
                objectInfo.find((o) => o.id === row.id) ??
                objectInfo.find((o) => o.id === row.propertyId);
            if (!oi) {
                return { ...row, roomTypes: [] };
            }
            if (!Array.isArray(oi.rooms) || oi.rooms.length === 0) {
                return row;
            }
            return {
                ...row,
                roomTypes: row.roomTypes.filter((r: { id: number }) => oi.rooms.includes(r.id)),
            };
        })
        .filter((row) => row.roomTypes.length > 0);
}

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
    
    const neededObjects = buildClientObjectRows(objects, users, objectMetadataMap, roomMetadataMap);

    const result = neededObjects.filter((object) => {
        if (options.excludeSubstr && object.name && object.name.includes(options.excludeSubstr)) {
            return false;
        }

        // excludeObjects хранит ID property (как в Beds24), а не roomType
        if (options.excludeObjects?.includes(object.propertyId)) {
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
    objects: { id: number; propertyId: number; name: string; roomTypes: { id: number; name: string; [k: string]: unknown }[]; [k: string]: unknown }[],
    userObjects: { id: number; rooms: number[] }[]
): typeof objects {
    if (!Array.isArray(userObjects) || userObjects.length === 0) return [];
    return objects
        .filter((obj) =>
            userObjects.some((uo) => uo.id === obj.id || uo.id === obj.propertyId)
        )
        .map((obj) => {
            const uo =
                userObjects.find((o) => o.id === obj.id) ??
                userObjects.find((o) => o.id === obj.propertyId);
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

    return buildClientObjectRows(objects, users, objectMetadataMap, roomMetadataMap);
}

