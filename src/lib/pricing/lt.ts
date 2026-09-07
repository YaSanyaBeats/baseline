const LT_TEXT =
    /(?:на\s+)?(?:полгода|пол\s*года|год\b|1\s*год)|(?:на\s+)?(?:6|7|8|9|10|11|12)\s*мес|long[\s-]?term|yearly|12\s*months?|for\s+a\s+year|до\s+\d{1,2}[./]\d{1,2}[./]\d{2,4}/i;

const ST_MONTH_ONLY = /на\s+(?:месяц|1\s*месяц|[2-5]\s*мес)/i;

export type LtBookingLite = {
    id?: number;
    masterId?: number | null;
    arrival?: string;
    departure?: string;
    firstName?: string;
    lastName?: string;
    comments?: string;
    notes?: string;
    status?: string;
};

export function stayNights(arrival?: string, departure?: string): number {
    if (!arrival || !departure) return 0;
    const a = Date.parse(arrival.slice(0, 10));
    const b = Date.parse(departure.slice(0, 10));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
}

export function textLooksLt(booking: LtBookingLite): boolean {
    const blob = [booking.firstName, booking.lastName, booking.comments, booking.notes]
        .filter(Boolean)
        .join(' ');
    if (!blob.trim()) return false;
    if (ST_MONTH_ONLY.test(blob) && stayNights(booking.arrival, booking.departure) < 180) {
        return false;
    }
    return LT_TEXT.test(blob);
}

export function isLongTermBooking(
    booking: LtBookingLite,
    chainNightsByMasterId: Map<number, number> = new Map(),
): boolean {
    if (stayNights(booking.arrival, booking.departure) >= 180) return true;
    if (textLooksLt(booking)) return true;
    const mid = booking.masterId;
    if (mid && (chainNightsByMasterId.get(mid) ?? 0) >= 180) return true;
    return false;
}

export function buildMasterIdNightMap(bookings: LtBookingLite[]): Map<number, number> {
    const map = new Map<number, number>();
    for (const b of bookings) {
        const mid = b.masterId;
        if (!mid) continue;
        map.set(mid, (map.get(mid) ?? 0) + stayNights(b.arrival, b.departure));
    }
    return map;
}
