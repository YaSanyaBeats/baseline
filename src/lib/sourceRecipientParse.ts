/** Значение: "room:objectId:encodedRoomName", "room:from_booking" (только правила автоучёта), "cp:…", "user:…" или "cf:…" */
import {
    PREFIX_ROOM,
    decodeRoomNameSegment,
    formatRoomSourceRecipient,
} from '@/lib/roomBinding';
import {
    INTERNAL_COMPANY_OBJECT_ID,
    commissionFundBranchName,
    managerFundBranchName,
} from '@/lib/sourceRecipientDistrictFunds';

export type SourceRecipientOptionValue = string;

export { PREFIX_ROOM, formatRoomSourceRecipient };
export const PREFIX_CP = 'cp:';
export const PREFIX_USER = 'user:';
export const PREFIX_CF = 'cf:';

/** В правиле автоучёта: при создании записи подставить объект+комнату из обрабатываемой брони */
export const ROOM_FROM_BOOKING_VALUE = 'room:from_booking' as const;

/** В настройках категории: при добавлении транзакции подставить комнату из общих полей формы */
export const ROOM_CURRENT_VALUE = 'room:current' as const;

/** Текущий фонд комиссии по району объекта → филиал «Комиссия …» */
export const ROOM_CURRENT_COMMISSION_FUND_VALUE = 'room:current_commission_fund' as const;

/** Текущий фонд менеджера по району объекта → филиал «HC-Менеджер …» */
export const ROOM_CURRENT_MANAGER_FUND_VALUE = 'room:current_manager_fund' as const;

/** Контрагент-провайдер интернета из метаданных текущей комнаты → cp:… */
export const ROOM_CURRENT_INTERNET_PROVIDER_VALUE = 'room:current_internet_provider' as const;

export type SourceRecipientResolveContext = {
    objectId?: number | null;
    roomName?: string | null;
    /** Район текущего объекта (objectRoomMetadata.district) */
    district?: string | null;
};

export type ParsedSourceRecipient =
    | { type: 'room'; objectId: number; roomName: string }
    | { type: 'room_from_booking' }
    | { type: 'room_current' }
    | { type: 'room_current_commission_fund' }
    | { type: 'room_current_manager_fund' }
    | { type: 'room_current_internet_provider' }
    | { type: 'counterparty'; id: string }
    | { type: 'user'; id: string }
    | { type: 'cashflow'; id: string };

export function parseSourceRecipientValue(
    value: SourceRecipientOptionValue | undefined,
): ParsedSourceRecipient | null {
    if (!value) return null;
    if (value === ROOM_FROM_BOOKING_VALUE) return { type: 'room_from_booking' };
    if (value === ROOM_CURRENT_VALUE) return { type: 'room_current' };
    if (value === ROOM_CURRENT_COMMISSION_FUND_VALUE) return { type: 'room_current_commission_fund' };
    if (value === ROOM_CURRENT_MANAGER_FUND_VALUE) return { type: 'room_current_manager_fund' };
    if (value === ROOM_CURRENT_INTERNET_PROVIDER_VALUE) return { type: 'room_current_internet_provider' };
    if (value.startsWith(PREFIX_ROOM)) {
        const m = /^room:(-?\d+):(.*)$/.exec(value);
        if (!m) return null;
        const objectId = parseInt(m[1], 10);
        const tail = m[2];
        if (Number.isNaN(objectId) || tail === '') return null;
        const roomName = decodeRoomNameSegment(tail);
        return { type: 'room', objectId, roomName };
    }
    if (value.startsWith(PREFIX_CP)) {
        const id = value.slice(PREFIX_CP.length);
        if (id) return { type: 'counterparty', id };
    }
    if (value.startsWith(PREFIX_USER)) {
        const id = value.slice(PREFIX_USER.length);
        if (id) return { type: 'user', id };
    }
    if (value.startsWith(PREFIX_CF)) {
        const id = value.slice(PREFIX_CF.length);
        if (id) return { type: 'cashflow', id };
    }
    return null;
}

/** Подставляет псевдо-значения room:* из контекста формы; остальные значения возвращает как есть. */
export function resolveSourceRecipientRoomContext(
    value: string | undefined | null,
    context: SourceRecipientResolveContext,
): string | undefined {
    const v = value != null ? String(value).trim() : '';
    if (!v) return undefined;
    if (v === ROOM_CURRENT_VALUE) {
        const oid = context.objectId;
        const rn = context.roomName != null ? String(context.roomName).trim() : '';
        if (oid != null && rn) return formatRoomSourceRecipient(oid, rn);
        return undefined;
    }
    if (v === ROOM_CURRENT_COMMISSION_FUND_VALUE) {
        const branch = commissionFundBranchName(context.district);
        if (branch) return formatRoomSourceRecipient(INTERNAL_COMPANY_OBJECT_ID, branch);
        return undefined;
    }
    if (v === ROOM_CURRENT_MANAGER_FUND_VALUE) {
        const branch = managerFundBranchName(context.district);
        if (branch) return formatRoomSourceRecipient(INTERNAL_COMPANY_OBJECT_ID, branch);
        return undefined;
    }
    return v;
}

/** Псевдо-значения room:*, которые разрешаются только из контекста формы. */
export function isResolvableRoomContextToken(value: string | undefined | null): boolean {
    const v = value != null ? String(value).trim() : '';
    return (
        v === ROOM_CURRENT_VALUE ||
        v === ROOM_CURRENT_COMMISSION_FUND_VALUE ||
        v === ROOM_CURRENT_MANAGER_FUND_VALUE ||
        v === ROOM_CURRENT_INTERNET_PROVIDER_VALUE
    );
}
