import { getDB } from '@/lib/db/getDB';
import { roomMetadataMapKey } from '@/lib/roomBinding';
import { getAllObjectMetadata, getAllRoomMetadata, type ObjectMetadataDoc, type RoomMetadataDoc } from '@/lib/server/objectRoomMetadata';
import type { ObjectType, RoomLevel } from '@/lib/types';
import { IP_COLLECTIONS } from './collections';
import { ensureCompetitorsOnCluster, remapCompetitorsAfterClusterRename } from './competitors';
import { getParameters, getRooms } from './seed';
import type { IpParameterCell, IpRoom } from './types';

export type ClusterSuggestion = {
    roomId: number;
    cluster: string;
    district: string | null;
    bedrooms: number | null;
    objectType: ObjectType | null;
    level: RoomLevel | null;
    needsOnboarding: boolean;
};

type BedsObject = {
    id?: number;
    roomTypes?: Array<{
        id?: number;
        name?: string;
        roomType?: string;
        units?: Array<{ name?: string }>;
    }>;
};

const TEMPLATE_BY_BEDROOMS: Record<number, string[]> = {
    0: ['Studio Surin', 'Studio Rawai'],
    1: ['1BR Surin+Bangtao', '1BR Rawai', 'Premium 1BR Bangtao'],
    2: ['2BR Bangtao', '2BR Rawai'],
};

const VILLA_TEMPLATES = ['Villa Rawai', 'Villa North'];
const PREMIUM_TEMPLATES = ['Premium 1BR Bangtao'];

const OBJECT_TYPE_LABEL: Record<ObjectType, string> = {
    apartments: 'Апартаменты',
    villa: 'Вилла',
};

const LEVEL_LABEL: Record<RoomLevel, string> = {
    economy: 'Эконом',
    comfort: 'Комфорт',
    premium: 'Премиум',
    lux: 'Люкс',
};

const VALID_OBJECT_TYPES = new Set<ObjectType>(['apartments', 'villa']);
const VALID_LEVELS = new Set<RoomLevel>(['economy', 'comfort', 'premium', 'lux']);

export function bedroomLabel(n: number): string {
    if (n <= 0) return 'Студия';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} спальня`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} спальни`;
    return `${n} спален`;
}

export function objectTypeLabel(type: ObjectType): string {
    return OBJECT_TYPE_LABEL[type];
}

export function roomLevelLabel(level: RoomLevel): string {
    return LEVEL_LABEL[level];
}

export function clusterNameFromMeta(params: {
    district: string;
    objectType: ObjectType;
    level: RoomLevel;
    bedrooms: number;
}): string {
    return [
        params.district,
        objectTypeLabel(params.objectType),
        roomLevelLabel(params.level),
        bedroomLabel(params.bedrooms),
    ].join(' · ');
}

export function parseBedroomsFromName(name: string): number | null {
    const s = name.toLowerCase();
    if (/\bstudio\b|\bstu\b|студи/.test(s)) return 0;
    const br = s.match(/(\d)\s*-?\s*(br|bed|спал|bedroom)/i);
    if (br) return Number(br[1]);
    return null;
}

export function parseObjectTypeFromName(name: string): ObjectType | null {
    const s = name.toLowerCase();
    if (/villa|вилл/.test(s)) return 'villa';
    if (/apartment|апарт|condo|кондо/.test(s)) return 'apartments';
    return null;
}

export function parseLevelFromName(name: string): RoomLevel | null {
    const s = name.toLowerCase();
    if (/\blux\b|люкс/.test(s)) return 'lux';
    if (/premium|премиум/.test(s)) return 'premium';
    if (/economy|эконом|budget/.test(s)) return 'economy';
    if (/comfort|комфорт/.test(s)) return 'comfort';
    return null;
}

function asObjectType(value: unknown): ObjectType | null {
    const s = String(value || '').toLowerCase();
    if (s === 'villa' || s === 'villas') return 'villa';
    if (s === 'apartments' || s === 'apartment' || s === 'condo') return 'apartments';
    return VALID_OBJECT_TYPES.has(s as ObjectType) ? (s as ObjectType) : null;
}

function asRoomLevel(value: unknown): RoomLevel | null {
    const s = String(value || '').toLowerCase();
    if (s === 'luxury') return 'lux';
    return VALID_LEVELS.has(s as RoomLevel) ? (s as RoomLevel) : null;
}

function modeValue<T extends string | number>(values: T[]): T | null {
    if (!values.length) return null;
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best = values[0];
    let bestN = 0;
    for (const [v, n] of counts) {
        if (n > bestN) {
            best = v;
            bestN = n;
        }
    }
    return best;
}

function collectUnitContext(room: IpRoom, objects: BedsObject[], roomMeta: Record<string, RoomMetadataDoc>) {
    const propertyId = room.propertyId;
    const obj = propertyId != null ? objects.find((o) => Number(o.id) === propertyId) : undefined;
    const rt = obj?.roomTypes?.find((r) => r != null && Number(r.id) === room.roomId);
    const unitNames = (rt?.units || []).map((u) => String(u?.name || '').trim()).filter(Boolean);
    if (rt?.name) unitNames.push(String(rt.name).trim());
    unitNames.push(room.name);
    const metas: RoomMetadataDoc[] = [];
    const seen = new Set<string>();
    for (const name of unitNames) {
        const keys = propertyId != null
            ? [roomMetadataMapKey(propertyId, name), roomMetadataMapKey(room.roomId, name)]
            : [roomMetadataMapKey(room.roomId, name)];
        for (const key of keys) {
            const meta = roomMeta[key];
            if (!meta || seen.has(key)) continue;
            seen.add(key);
            metas.push(meta);
        }
    }
    if (propertyId != null) {
        for (const meta of Object.values(roomMeta)) {
            if (Number(meta.objectId) !== propertyId && Number(meta.objectId) !== room.roomId) continue;
            const metaName = String(meta.roomName || '');
            if (metaName && (metaName === room.name || metaName === rt?.name)) metas.push(meta);
        }
    }
    return { obj, rt, unitNames, metas };
}

function resolveDistrict(room: IpRoom, objMeta: Record<number, ObjectMetadataDoc>): string | null {
    if (room.propertyId != null && objMeta[room.propertyId]?.district) {
        return String(objMeta[room.propertyId].district);
    }
    if (objMeta[room.roomId]?.district) return String(objMeta[room.roomId].district);
    return null;
}

function resolveObjectType(
    room: IpRoom,
    objMeta: Record<number, ObjectMetadataDoc>,
    ctx: ReturnType<typeof collectUnitContext>,
): ObjectType | null {
    if (room.propertyId != null) {
        const fromMeta = asObjectType(objMeta[room.propertyId]?.objectType);
        if (fromMeta) return fromMeta;
    }
    const fromRoomMeta = asObjectType(objMeta[room.roomId]?.objectType);
    if (fromRoomMeta) return fromRoomMeta;
    const fromBeds = asObjectType(ctx.rt?.roomType);
    if (fromBeds) return fromBeds;
    for (const name of ctx.unitNames) {
        const parsed = parseObjectTypeFromName(name);
        if (parsed) return parsed;
    }
    return parseObjectTypeFromName(room.propertyName || '') || parseObjectTypeFromName(room.name);
}

function resolveLevel(room: IpRoom, ctx: ReturnType<typeof collectUnitContext>): RoomLevel | null {
    const fromMeta = modeValue(ctx.metas.map((m) => asRoomLevel(m.level)).filter((v): v is RoomLevel => v != null));
    if (fromMeta) return fromMeta;
    for (const name of ctx.unitNames) {
        const parsed = parseLevelFromName(name);
        if (parsed) return parsed;
    }
    return parseLevelFromName(room.name);
}

function resolveBedrooms(room: IpRoom, ctx: ReturnType<typeof collectUnitContext>): number | null {
    const studioFromName = ctx.unitNames.map(parseBedroomsFromName).find((n) => n === 0);
    if (studioFromName === 0) return 0;
    const fromMeta = modeValue(ctx.metas.map((m) => m.bedrooms).filter((v): v is number => typeof v === 'number'));
    if (fromMeta != null) return fromMeta;
    return parseBedroomsFromName(room.name);
}

export async function suggestClustersFromMetadata(rooms?: IpRoom[]): Promise<ClusterSuggestion[]> {
    const list = rooms ?? (await getRooms());
    const db = await getDB();
    const [objects, objMeta, roomMeta] = await Promise.all([
        db.collection('objects').find({}).toArray() as Promise<BedsObject[]>,
        getAllObjectMetadata(),
        getAllRoomMetadata(),
    ]);
    return list.map((room) => {
        const ctx = collectUnitContext(room, objects, roomMeta);
        const district = resolveDistrict(room, objMeta);
        const objectType = resolveObjectType(room, objMeta, ctx);
        const level = resolveLevel(room, ctx);
        const bedrooms = resolveBedrooms(room, ctx);
        if (!district || !objectType || !level || bedrooms == null) {
            return {
                roomId: room.roomId,
                cluster: '',
                district,
                bedrooms,
                objectType,
                level,
                needsOnboarding: true,
            };
        }
        return {
            roomId: room.roomId,
            cluster: clusterNameFromMeta({ district, objectType, level, bedrooms }),
            district,
            bedrooms,
            objectType,
            level,
            needsOnboarding: false,
        };
    });
}

function pickParamTemplate(
    suggestion: Pick<ClusterSuggestion, 'bedrooms' | 'objectType' | 'level'>,
    oldClusters: string[],
    existingNames: Set<string>,
): string | null {
    const uniqueOld = [...new Set(oldClusters.filter((n) => n && existingNames.has(n)))];
    if (uniqueOld.length === 1) return uniqueOld[0];
    const prefs: string[] = [];
    if (suggestion.objectType === 'villa' || (suggestion.bedrooms != null && suggestion.bedrooms >= 3)) {
        prefs.push(...VILLA_TEMPLATES);
    }
    if (suggestion.level === 'premium' || suggestion.level === 'lux') {
        prefs.push(...PREMIUM_TEMPLATES);
    }
    if (suggestion.bedrooms != null) {
        prefs.push(...(TEMPLATE_BY_BEDROOMS[suggestion.bedrooms] || TEMPLATE_BY_BEDROOMS[1]));
    }
    const fromPrefs = prefs.find((n) => existingNames.has(n));
    if (fromPrefs) return fromPrefs;
    return uniqueOld[0] || [...existingNames][0] || null;
}

async function copyParameterGrid(sourceCluster: string, targetCluster: string, params: IpParameterCell[]) {
    const db = await getDB();
    const cells = params.filter((p) => p.cluster === sourceCluster);
    if (!cells.length) return 0;
    await db.collection(IP_COLLECTIONS.parameters).insertMany(
        cells.map((cell) => {
            const raw = cell as IpParameterCell & { _id?: unknown };
            const { _id: _ignored, cluster: _old, ...rest } = raw;
            return { ...rest, cluster: targetCluster };
        }),
    );
    return cells.length;
}

export async function rebuildClustersFromMetadata(): Promise<{
    assigned: number;
    unassigned: number;
    clusters: string[];
    parametersCopied: number;
}> {
    const rooms = await getRooms();
    const suggestions = await suggestClustersFromMetadata(rooms);
    await ensureCompetitorsOnCluster();

    const byRoom = new Map(rooms.map((r) => [r.roomId, r]));
    const oldToNew = new Map<string, Set<string>>();
    for (const s of suggestions) {
        const old = byRoom.get(s.roomId)?.cluster || '';
        if (!old || !s.cluster) continue;
        const set = oldToNew.get(old) || new Set<string>();
        set.add(s.cluster);
        oldToNew.set(old, set);
    }

    const params = await getParameters();
    const existingNames = new Set(params.map((p) => p.cluster));
    let parametersCopied = 0;
    const newClusters = [...new Set(suggestions.map((s) => s.cluster).filter(Boolean))];

    for (const name of newClusters) {
        if (existingNames.has(name)) continue;
        const members = suggestions.filter((s) => s.cluster === name);
        const first = members[0];
        if (!first) continue;
        const oldClusters = members.map((s) => byRoom.get(s.roomId)?.cluster || '').filter(Boolean);
        const template = pickParamTemplate(first, oldClusters, existingNames);
        if (!template) continue;
        const copied = await copyParameterGrid(template, name, params);
        if (copied) {
            existingNames.add(name);
            parametersCopied += copied;
        }
    }

    const db = await getDB();
    const roomsCol = db.collection(IP_COLLECTIONS.rooms);
    for (const s of suggestions) {
        const room = byRoom.get(s.roomId);
        await roomsCol.updateOne(
            { roomId: s.roomId },
            {
                $set: {
                    cluster: s.cluster,
                    needsOnboarding: s.needsOnboarding,
                    district: s.district,
                    bedrooms: s.bedrooms,
                    objectType: s.objectType,
                    level: s.level,
                    floor: room?.floor ?? null,
                },
            },
        );
    }

    await remapCompetitorsAfterClusterRename(oldToNew);

    return {
        assigned: suggestions.filter((s) => s.cluster).length,
        unassigned: suggestions.filter((s) => !s.cluster).length,
        clusters: newClusters,
        parametersCopied,
    };
}
