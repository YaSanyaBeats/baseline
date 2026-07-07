import { Booking, Object as Obj } from '@/lib/types';
import { getBookingRefererDisplay } from '@/lib/format';
import { stableAccountancyRoomLabel } from '@/lib/accountancyObjectGroups';

function normalizeUnitOrRoomId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

function ruNightsWord(n: number): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m100 >= 11 && m100 <= 14) return 'ночей';
    if (m10 === 1) return 'ночь';
    if (m10 >= 2 && m10 <= 4) return 'ночи';
    return 'ночей';
}

/** Ночи проживания: «(N ночь/ночи/ночей)» по разнице календарных дней (Beds24). Пустая строка, если данных нет. */
export function formatBookingNightsLabel(arrival: unknown, departure: unknown): string {
    if (arrival == null || departure == null) return '';
    const aStr = String(arrival).trim();
    const dStr = String(departure).trim();
    const mA = aStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const mD = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let a: Date;
    let d: Date;
    if (mA && mD) {
        a = new Date(Number(mA[1]), Number(mA[2]) - 1, Number(mA[3]));
        d = new Date(Number(mD[1]), Number(mD[2]) - 1, Number(mD[3]));
    } else {
        a = new Date(aStr);
        d = new Date(dStr);
    }
    if (Number.isNaN(a.getTime()) || Number.isNaN(d.getTime())) return '';
    const days = Math.round((d.getTime() - a.getTime()) / 86_400_000);
    if (days < 0) return '';
    return `(${days} ${ruNightsWord(days)})`;
}

export const BOOKING_GROUP_COMMENT_MAX = 50;

/** Полный комментарий к брони (без усечения) или null, если пусто. */
export function getBookingGroupCommentTextFull(b: Booking): string | null {
    for (const key of [b.comments, b.notes, b.message] as const) {
        if (key == null) continue;
        const s = String(key).replace(/\s+/g, ' ').trim();
        if (s !== '') return s;
    }
    return null;
}

/** Комментарий к брони: до 50 символов. Пустая строка, если комментария нет. */
export function getBookingGroupCommentText(b: Booking): string {
    const full = getBookingGroupCommentTextFull(b);
    if (full == null) return '';
    if (full.length <= BOOKING_GROUP_COMMENT_MAX) return full;
    return full.slice(0, BOOKING_GROUP_COMMENT_MAX - 1) + '…';
}

/** Кол-во гостей в скобках: (2); пустая строка, если numAdult/numChild не заданы. */
export function formatGuestCountInParens(b: Booking): string {
    const hasA = typeof b.numAdult === 'number';
    const hasC = typeof b.numChild === 'number';
    if (!hasA && !hasC) return '';
    const n = (b.numAdult ?? 0) + (b.numChild ?? 0);
    return `(${n})`;
}

export type BookingGroupLocationContext = {
    objectName?: string;
    roomName?: string;
};

export type BookingGroupLineModel = {
    segments: [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
    ];
    /** Для подсказки: полный комментарий, если в строке он усечён. */
    commentFull: string | null;
    /** Объект брони — в конце заголовка группы. */
    objectName?: string;
    /** Комната брони — в конце заголовка группы. */
    roomName?: string;
};

/** Собирает заголовок группы брони: только непустые части через « · », без заполнителей для пропусков. */
export function joinBookingGroupSegments(parts: readonly string[]): string {
    return parts.map((s) => String(s).trim()).filter((s) => s !== '').join(' · ');
}

/** Подпись объекта и комнаты для Tooltip (без изменения видимого заголовка). */
export function formatBookingGroupLocationTooltip(line: BookingGroupLineModel): string | null {
    const parts = [line.objectName, line.roomName]
        .map((s) => (s != null ? String(s).trim() : ''))
        .filter((s) => s !== '');
    return parts.length > 0 ? parts.join(' · ') : null;
}

/** Объект и комната брони по справочнику объектов (propertyId / unitId). */
export function resolveBookingLocationFromObjects(
    booking: Booking,
    objects: Obj[],
): BookingGroupLocationContext {
    const unitId = normalizeUnitOrRoomId(booking.unitId ?? booking.roomId ?? booking.roomID);
    const propertyId = normalizeUnitOrRoomId(booking.propertyId);

    const candidates =
        propertyId != null
            ? objects.filter((o) => (o.propertyId ?? o.id) === propertyId || o.id === propertyId)
            : objects;
    const searchIn = candidates.length > 0 ? candidates : objects;

    if (unitId != null) {
        for (const obj of searchIn) {
            const room = obj.roomTypes?.find((r) => r.id === unitId);
            if (room) {
                const objectName = String(obj.name ?? '').trim();
                return {
                    ...(objectName ? { objectName } : {}),
                    roomName: stableAccountancyRoomLabel(room),
                };
            }
        }
        for (const obj of objects) {
            if (searchIn.includes(obj)) continue;
            const room = obj.roomTypes?.find((r) => r.id === unitId);
            if (room) {
                const objectName = String(obj.name ?? '').trim();
                return {
                    ...(objectName ? { objectName } : {}),
                    roomName: stableAccountancyRoomLabel(room),
                };
            }
        }
    }

    if (searchIn.length === 1) {
        const objectName = String(searchIn[0].name ?? '').trim();
        return objectName ? { objectName } : {};
    }

    return {};
}

/**
 * Сегменты заголовка группы брони: заезд · выезд · ночи · источник · заголовок · имя · фамилия · комментарий · (гостей).
 */
export function buildBookingGroupLineModel(
    b: Booking,
    location?: BookingGroupLocationContext,
): BookingGroupLineModel {
    const segText = (v: unknown) => {
        if (v === undefined || v === null) return '';
        const s = String(v).trim();
        return s !== '' ? s : '';
    };
    const segDate = (v: unknown) => {
        if (v === undefined || v === null || v === '') return '';
        const d = new Date(v as string | Date);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };
    const segSource = (booking: Booking) => {
        const raw = [booking.refererEditable, booking.referer, booking.channel].find(
            (s) => s != null && String(s).trim() !== '',
        );
        if (raw == null) return '';
        return getBookingRefererDisplay(String(raw).trim());
    };

    const commentFull = getBookingGroupCommentTextFull(b);
    const segments: BookingGroupLineModel['segments'] = [
        segDate(b.arrival),
        segDate(b.departure),
        formatBookingNightsLabel(b.arrival, b.departure),
        segSource(b),
        segText(b.title),
        segText(b.firstName),
        segText(b.lastName),
        getBookingGroupCommentText(b),
        formatGuestCountInParens(b),
    ];
    return {
        segments,
        commentFull,
        ...(location?.objectName?.trim() ? { objectName: location.objectName.trim() } : {}),
        ...(location?.roomName?.trim() ? { roomName: location.roomName.trim() } : {}),
    };
}
