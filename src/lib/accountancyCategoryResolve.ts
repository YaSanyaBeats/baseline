import type {
    AccountancyCategory,
    AccountancyCategoryType,
    Expense,
    Income,
    SourceRecipientValue,
} from './types';
import { normalizeMongoIdString } from './mongoId';
import {
    PREFIX_CP,
    ROOM_CURRENT_INTERNET_PROVIDER_VALUE,
    resolveSourceRecipientRoomContext,
    type SourceRecipientResolveContext,
} from './sourceRecipientParse';

/** Категория «интернет»: стоимость и получатель берутся из метаданных комнаты. */
export const INTERNET_ROOM_EXPENSE_CATEGORY_ID = '6978b4d4aef81bcff93d2df4';

export type ObjectForRoomDefaults = {
    id: number;
    propertyId?: number;
    district?: string;
    roomTypes: {
        id?: number;
        name?: string;
        internetCostPerMonth?: number;
        internetProviderCounterpartyId?: string;
    }[];
};

export type RoomForDefaults = ObjectForRoomDefaults['roomTypes'][number];

export type CategoryDefaultsContext = SourceRecipientResolveContext & {
    objects?: readonly ObjectForRoomDefaults[];
    /** Все строки группы выбранного объекта сводки (несколько roomType Beds24) */
    objectGroupMembers?: readonly ObjectForRoomDefaults[];
    /** Комната из фильтра сводки / общих полей формы — приоритетнее поиска по имени */
    selectedRoom?: RoomForDefaults;
};

export type CategoryRecordRef = {
    categoryId?: string | null;
    category?: string | null;
};

export type AppLanguage = 'ru' | 'en';

/** Отображаемое название категории с учётом языка интерфейса. */
export function getCategoryDisplayName(
    category: Pick<AccountancyCategory, 'name' | 'nameEn'>,
    language: AppLanguage = 'ru',
): string {
    if (language === 'en') {
        const en = category.nameEn != null ? String(category.nameEn).trim() : '';
        if (en) return en;
    }
    return String(category.name ?? '').trim();
}

/** Карта categoryId → название категории для отображения. */
export function buildCategoryNameByIdMap(
    categories: AccountancyCategory[],
    language: AppLanguage = 'ru',
): Map<string, string> {
    const map = new Map<string, string>();
    for (const c of categories) {
        const id = c._id != null ? normalizeMongoIdString(c._id).trim() : '';
        if (id) map.set(id, getCategoryDisplayName(c, language));
    }
    return map;
}

export function mergeCategoryNameMaps(...maps: Map<string, string>[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const m of maps) {
        for (const [k, v] of m) mapSet(result, k, v);
    }
    return result;
}

function mapSet(map: Map<string, string>, key: string, value: string) {
    map.set(key, value);
}

/** Название категории: сначала по categoryId, иначе legacy-поле category. */
export function resolveCategoryName(
    record: CategoryRecordRef,
    nameById: Map<string, string>,
): string {
    const id = record.categoryId != null ? normalizeMongoIdString(record.categoryId).trim() : '';
    if (id && nameById.has(id)) return nameById.get(id)!;
    return String(record.category ?? '').trim();
}

export function resolveExpenseCategoryName(e: Expense, nameById: Map<string, string>): string {
    return resolveCategoryName(e, nameById);
}

export function resolveIncomeCategoryName(i: Income, nameById: Map<string, string>): string {
    return resolveCategoryName(i, nameById);
}

export function findCategoryById(
    categories: AccountancyCategory[],
    id: string,
): AccountancyCategory | undefined {
    const norm = normalizeMongoIdString(id).trim();
    return categories.find((c) => c._id != null && normalizeMongoIdString(c._id) === norm);
}

export function resolveCategoryFieldsFromId(
    categoryId: string,
    categories: AccountancyCategory[],
    type: AccountancyCategoryType,
): { categoryId: string; category: string } | null {
    const cat = findCategoryById(categories, categoryId);
    if (!cat || cat.type !== type) return null;
    return { categoryId: normalizeMongoIdString(cat._id!), category: cat.name };
}

export type CategoryTransactionDefaults = {
    source?: SourceRecipientValue;
    recipient?: SourceRecipientValue;
    pricePerUnit?: number;
};

export function findCategoryByName(
    categories: AccountancyCategory[],
    name: string,
    type?: AccountancyCategoryType,
): AccountancyCategory | undefined {
    const norm = String(name ?? '').trim();
    if (!norm) return undefined;
    return categories.find((c) => c.name === norm && (type == null || c.type === type));
}

/** Значения по умолчанию для полей транзакции из настроек категории. */
export function getCategoryTransactionDefaults(
    cat: AccountancyCategory | undefined,
): CategoryTransactionDefaults {
    if (!cat) return {};
    const result: CategoryTransactionDefaults = {};
    const src = cat.source != null ? String(cat.source).trim() : '';
    const rec = cat.recipient != null ? String(cat.recipient).trim() : '';
    if (src) result.source = src;
    if (rec) result.recipient = rec;
    if (cat.pricePerUnit != null && !Number.isNaN(cat.pricePerUnit)) {
        result.pricePerUnit = cat.pricePerUnit;
    }
    return result;
}

function stableRoomLookupName(room: { id?: number; name?: string }): string {
    return room.name != null && String(room.name).trim() !== ''
        ? String(room.name).trim()
        : `Unit ${room.id ?? ''}`;
}

export function findRoomInObjects(
    objects: readonly ObjectForRoomDefaults[] | undefined,
    objectId: number | null | undefined,
    roomName: string | null | undefined,
    searchIn?: readonly ObjectForRoomDefaults[],
): ObjectForRoomDefaults['roomTypes'][number] | undefined {
    const rn = roomName != null ? String(roomName).trim() : '';
    if (!rn) return undefined;

    let candidates: readonly ObjectForRoomDefaults[] = [];
    if (searchIn?.length) {
        candidates = searchIn;
    } else if (objects?.length && objectId != null) {
        const obj = objects.find((o) => o.id === objectId || o.propertyId === objectId);
        candidates = obj ? [obj] : [];
    } else {
        return undefined;
    }

    const roomMetaScore = (room: ObjectForRoomDefaults['roomTypes'][number]): number => {
        let score = 0;
        if (room.internetProviderCounterpartyId != null && normalizeMongoIdString(room.internetProviderCounterpartyId).trim()) {
            score += 4;
        }
        if (room.internetCostPerMonth != null && !Number.isNaN(room.internetCostPerMonth)) {
            score += 2;
        }
        return score;
    };

    let best: ObjectForRoomDefaults['roomTypes'][number] | undefined;
    for (const obj of candidates) {
        for (const room of obj.roomTypes) {
            if (stableRoomLookupName(room) !== rn) continue;
            if (!best || roomMetaScore(room) > roomMetaScore(best)) {
                best = room;
            }
        }
    }
    return best;
}

function resolveInternetCategoryRoom(context: CategoryDefaultsContext): RoomForDefaults | undefined {
    if (context.selectedRoom) return context.selectedRoom;
    return findRoomInObjects(
        context.objects,
        context.objectId,
        context.roomName,
        context.objectGroupMembers,
    );
}

export function isInternetRoomExpenseCategory(cat: AccountancyCategory | undefined): boolean {
    if (!cat?._id) return false;
    return normalizeMongoIdString(cat._id) === INTERNET_ROOM_EXPENSE_CATEGORY_ID;
}

function applyInternetRoomCategoryOverrides(
    result: CategoryTransactionDefaults,
    cat: AccountancyCategory | undefined,
    context: CategoryDefaultsContext,
): CategoryTransactionDefaults {
    if (!isInternetRoomExpenseCategory(cat)) return result;
    const room = resolveInternetCategoryRoom(context);
    if (!room) return result;
    const next = { ...result };
    if (room.internetCostPerMonth != null && !Number.isNaN(room.internetCostPerMonth)) {
        next.pricePerUnit = room.internetCostPerMonth;
    }
    return next;
}

/** Контрагент интернета из метаданных текущей комнаты. */
export function resolveInternetProviderRecipient(context: CategoryDefaultsContext): string | undefined {
    const room = resolveInternetCategoryRoom(context);
    const cpId = normalizeMongoIdString(room?.internetProviderCounterpartyId).trim();
    return cpId ? `${PREFIX_CP}${cpId}` : undefined;
}

/** Разрешает псевдо-значения категории (room:current, room:current_internet_provider, …) в контексте формы. */
export function resolveCategorySourceRecipientValue(
    value: string | undefined | null,
    context: CategoryDefaultsContext,
): string | undefined {
    const v = value != null ? String(value).trim() : '';
    if (!v) return undefined;
    if (v === ROOM_CURRENT_INTERNET_PROVIDER_VALUE) {
        return resolveInternetProviderRecipient(context);
    }
    return resolveSourceRecipientRoomContext(v, context) ?? v;
}

/** Как getCategoryTransactionDefaults, но псевдо-значения room:* разрешаются из контекста формы. */
export function resolveCategoryTransactionDefaults(
    cat: AccountancyCategory | undefined,
    context: CategoryDefaultsContext,
): CategoryTransactionDefaults {
    const raw = getCategoryTransactionDefaults(cat);
    const base: CategoryTransactionDefaults = {
        pricePerUnit: raw.pricePerUnit,
        source: raw.source ? resolveCategorySourceRecipientValue(raw.source, context) : undefined,
        recipient: raw.recipient ? resolveCategorySourceRecipientValue(raw.recipient, context) : undefined,
    };
    return applyInternetRoomCategoryOverrides(base, cat, context);
}

export function buildAccountancyQuickAddCategoryContext(params: {
    selectedObject: ObjectForRoomDefaults | null | undefined;
    selectedRoomId: string | 'all';
    selectedRoom?: RoomForDefaults | null;
    objects: readonly ObjectForRoomDefaults[];
    objectGroupMembers: readonly ObjectForRoomDefaults[];
}): CategoryDefaultsContext {
    const { selectedObject, selectedRoomId, selectedRoom, objects, objectGroupMembers } = params;
    if (!selectedObject) {
        return { objects };
    }
    return {
        objectId: selectedObject.id,
        roomName: selectedRoomId === 'all' ? undefined : selectedRoomId,
        district: selectedObject.district ?? null,
        objects,
        objectGroupMembers: objectGroupMembers.length > 0 ? objectGroupMembers : [selectedObject],
        selectedRoom: selectedRoom ?? undefined,
    };
}

export function resolveCategoryIdFromRecord(
    record: CategoryRecordRef,
    categories: AccountancyCategory[],
    type: AccountancyCategoryType,
): string {
    const existing = record.categoryId != null ? normalizeMongoIdString(record.categoryId).trim() : '';
    if (existing && findCategoryById(categories, existing)) return existing;
    const name = String(record.category ?? '').trim();
    if (!name) return '';
    const matches = categories.filter((c) => c.type === type && c.name === name);
    if (matches.length === 1 && matches[0]._id) {
        return normalizeMongoIdString(matches[0]._id);
    }
    return existing;
}
