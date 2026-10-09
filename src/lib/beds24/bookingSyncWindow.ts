/** Начало текущего месяца в Таиланде: с этой даты заездов брони обновляются из Beds24. */
export function bookingsSyncArrivalFrom(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) {
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    return `${year}-${month}-01`;
}

export function bookingArrivalIsoDate(arrival: unknown): string | null {
    if (arrival instanceof Date && !Number.isNaN(arrival.getTime())) {
        return arrival.toISOString().slice(0, 10);
    }
    if (typeof arrival !== 'string') return null;
    const iso = arrival.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Заезд не раньше `arrivalFrom` (YYYY-MM-DD). Без даты заезда — нет. */
export function isBookingArrivalOnOrAfter(arrival: unknown, arrivalFrom: string): boolean {
    const iso = bookingArrivalIsoDate(arrival);
    if (!iso) return false;
    return iso >= arrivalFrom;
}

/**
 * Бронь старше окна синка (заезд до начала текущего месяца) или без даты заезда.
 * Такие документы при синхронизации не перезаписываются и не удаляются.
 */
export function isBookingBeforeSyncWindow(arrival: unknown, arrivalFrom: string): boolean {
    const iso = bookingArrivalIsoDate(arrival);
    if (!iso) return true;
    return iso < arrivalFrom;
}
