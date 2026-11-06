import { daysBetween, parseIsoDate } from '../periods';

/** Одна точка суточной цены внутри выбранного периода. */
export type NightlySample = {
    checkIn: string;
    checkOut: string;
    stayNights: number;
    nightly: number;
};

export type NightlySummary = {
    average: number | null;
    min: number | null;
    max: number | null;
    /** Ставка внутри периода разошлась сильнее шума округления. */
    changed: boolean;
};

function iso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function addIsoDays(value: string, days: number): string {
    const d = parseIsoDate(value);
    d.setDate(d.getDate() + days);
    return iso(d);
}

function todayIso(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return iso(d);
}

/** Ночей от check-in до lastNight включительно. */
function nightsCovered(checkIn: string, lastNight: string): number {
    return daysBetween(parseIsoDate(checkIn), parseIsoDate(lastNight)) + 1;
}

/**
 * Первая ночь выбранного периода, которую ещё можно запросить.
 * periodEnd — последняя ночь периода (дата, которую показывает выбор периода).
 * Если период уже прошёл, берём его последнюю ночь: одну, без повторов.
 */
export function firstNightInPeriod(periodStart: string, periodEnd: string, today = todayIso()): string | null {
    if (!periodStart || !periodEnd || periodStart > periodEnd) return null;
    const tomorrow = addIsoDays(today, 1);
    let from = periodStart > tomorrow ? periodStart : tomorrow;
    if (from > periodEnd) from = periodEnd;
    if (from < periodStart || from > periodEnd) return null;
    return from;
}

/**
 * Вторая ночь для проверки, не сдвинулась ли ставка.
 * Только если до конца периода ещё хотя бы неделя — иначе второй запрос не окупается.
 */
export function laterNightInPeriod(first: string, periodEnd: string): string | null {
    const span = daysBetween(parseIsoDate(first), parseIsoDate(periodEnd));
    if (span < 7) return null;
    const shift = Math.max(7, Math.round(span / 2));
    let next = addIsoDays(first, shift);
    if (next > periodEnd) next = periodEnd;
    if (next <= first) return null;
    return next;
}

/**
 * Повтор, если за одну ночь цены нет: более длинное проживание внутри того же периода.
 * Checkout не выходит за день после последней ночи. Тот же запрос на 1 ночь не повторяем.
 */
export function fallbackStay(
    first: string,
    periodStart: string,
    periodEnd: string,
    today = todayIso(),
): { checkIn: string; stayNights: number } | null {
    const periodNights = nightsCovered(periodStart, periodEnd);
    const stayCap = Math.min(7, periodNights);
    if (stayCap < 2) return null;

    const tomorrow = addIsoDays(today, 1);
    const past = tomorrow > periodEnd;
    const floor = past ? periodStart : periodStart > tomorrow ? periodStart : tomorrow;

    const latestFor = (stay: number) => addIsoDays(periodEnd, -(stay - 1));
    let checkIn = addIsoDays(first, 3);
    const latest = latestFor(stayCap);
    if (checkIn > latest) checkIn = latest;
    if (checkIn < floor) checkIn = floor;

    const fit = nightsCovered(checkIn, periodEnd);
    if (fit < 2) return null;
    const stayNights = Math.min(stayCap, fit);
    if (stayNights < 2) return null;
    if (checkIn === first && stayNights === 1) return null;
    return { checkIn, stayNights };
}

/** 2% или 50 ฿ — меньше считаем шумом деления суммы на ночи. */
export function nightlyRangeChanged(min: number | null, max: number | null): boolean {
    if (min == null || max == null || !(min > 0) || !(max > min)) return false;
    return max - min >= 50 || (max - min) / min >= 0.02;
}

export function summarizeNightly(samples: Array<{ nightly: number }>): NightlySummary {
    const prices = samples.map((s) => s.nightly).filter((n) => Number.isFinite(n) && n > 0);
    if (!prices.length) return { average: null, min: null, max: null, changed: false };
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const average = Math.round(prices.reduce((sum, n) => sum + n, 0) / prices.length);
    return { average, min, max, changed: nightlyRangeChanged(min, max) };
}
