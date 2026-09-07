import type { AppLanguage } from '@/lib/accountancyCategoryResolve';
import { getInternalObjectRoomDisplayName } from '@/lib/internalObjectDisplay';
import { normalizeMongoIdString } from '@/lib/mongoId';
import {
    parseSourceRecipientValue,
    type SourceRecipientOptionValue,
} from '@/lib/sourceRecipientParse';

export function formatSourceRecipientLabel(
    value: SourceRecipientOptionValue | undefined,
    objects: { id: number; name: string; roomTypes: { id: number; name: string; nameEn?: string | null }[] }[],
    counterparties: { _id: string; name: string }[],
    usersWithCashflow?: { _id: string; name: string }[],
    cashflows?: { _id: string; name: string }[],
    /** Подпись для «room:from_booking» (правила автоучёта); иначе запасной текст на англ. */
    roomFromBookingLabel?: string,
    /** Подпись для «room:current» (настройки категории) */
    currentRoomLabel?: string,
    currentCommissionFundLabel?: string,
    currentManagerFundLabel?: string,
    currentInternetProviderLabel?: string,
    language: AppLanguage = 'ru',
): string {
    const parsed = parseSourceRecipientValue(value);
    if (!parsed) return '—';
    if (parsed.type === 'room_from_booking') {
        return roomFromBookingLabel ?? 'Room from booking';
    }
    if (parsed.type === 'room_current') {
        return currentRoomLabel ?? 'Current room';
    }
    if (parsed.type === 'room_current_commission_fund') {
        return currentCommissionFundLabel ?? 'Current commission fund';
    }
    if (parsed.type === 'room_current_manager_fund') {
        return currentManagerFundLabel ?? 'Current manager fund';
    }
    if (parsed.type === 'room_current_internet_provider') {
        return currentInternetProviderLabel ?? 'Current internet provider';
    }
    if (parsed.type === 'room') {
        const obj = objects.find((o) => o.id === parsed.objectId);
        const room = obj?.roomTypes?.find((r) => (r.name || '').trim() === (parsed.roomName || '').trim());
        if (obj && room) {
            const roomLabel =
                obj.id < 0
                    ? getInternalObjectRoomDisplayName(room, language) || `Room ${room.id}`
                    : room.name || `Room ${room.id}`;
            return `${obj.name} — ${roomLabel}`;
        }
        return `Object ${parsed.objectId}, ${parsed.roomName}`;
    }
    if (parsed.type === 'counterparty') {
        const cp = counterparties.find((c) => normalizeMongoIdString(c._id) === parsed.id);
        return cp ? cp.name : parsed.id;
    }

    if (parsed.type === 'user' && usersWithCashflow) {
        const idStr = String(parsed.id);
        const u = usersWithCashflow.find((x) => {
            const xId = typeof x._id === 'string' ? x._id : (x._id as { toString?: () => string })?.toString?.() ?? '';
            return xId === idStr;
        });
        return u ? u.name : parsed.id;
    }
    if (parsed.type === 'cashflow' && cashflows) {
        const cf = cashflows.find((c) => c._id === parsed.id);
        return cf ? cf.name : parsed.id;
    }
    return parsed.id || '—';
}
