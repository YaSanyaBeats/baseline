export const PERIOD_IDS = [
    'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
    'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14',
] as const;

export type PeriodId = (typeof PERIOD_IDS)[number];

export type SeasonRegime = 'HIGH' | 'SHOULDER' | 'LOW';

/** 0-based month, day. P1 wraps across years (Dec → Jan). */
const PERIOD_BOUNDS: Record<PeriodId, { start: [number, number]; end: [number, number]; wraps: boolean; label: string }> = {
    P1: { start: [11, 25], end: [0, 15], wraps: true, label: '25.12–15.01' },
    P2: { start: [0, 16], end: [0, 31], wraps: false, label: '16–31.01' },
    P3: { start: [1, 1], end: [1, 28], wraps: false, label: 'февраль' },
    P4: { start: [2, 1], end: [2, 31], wraps: false, label: 'март' },
    P5: { start: [3, 1], end: [3, 30], wraps: false, label: 'апрель' },
    P6: { start: [4, 1], end: [4, 31], wraps: false, label: 'май' },
    P7: { start: [5, 1], end: [5, 30], wraps: false, label: 'июнь' },
    P8: { start: [6, 1], end: [6, 31], wraps: false, label: 'июль' },
    P9: { start: [7, 1], end: [7, 31], wraps: false, label: 'август' },
    P10: { start: [8, 1], end: [9, 14], wraps: false, label: '01.09–14.10' },
    P11: { start: [9, 15], end: [9, 31], wraps: false, label: '15–31.10' },
    P12: { start: [10, 1], end: [10, 19], wraps: false, label: '01–19.11' },
    P13: { start: [10, 20], end: [11, 9], wraps: false, label: '20.11–09.12' },
    P14: { start: [11, 10], end: [11, 24], wraps: false, label: '10–24.12' },
};

export const PERIOD_LABELS: Record<PeriodId, string> = Object.fromEntries(
    PERIOD_IDS.map((id) => [id, PERIOD_BOUNDS[id].label]),
) as Record<PeriodId, string>;

export type PeriodWindow = {
    period: PeriodId;
    year: number;
    start: Date;
    end: Date;
    startIso: string;
    endIso: string;
    nights: number;
    daysToArrival: number;
};

function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function lastDayOfMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
}

function makeDate(year: number, month0: number, day: number): Date {
    const max = lastDayOfMonth(year, month0);
    return new Date(year, month0, Math.min(day, max));
}

export function daysBetween(from: Date, to: Date): number {
    const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
}

export function parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

/** Same formatting as analytics table headers: 01.09.2026 - 14.10.2026 */
export function formatDisplayDate(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()}`;
}

export function formatPeriodRange(start: Date, end: Date): string {
    return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
}

/**
 * Analytics “beds24” year: P1 is 25.12 of previous calendar year … 15.01 of `year`.
 * Dates from 25 Dec belong to the next season year.
 */
export function seasonYearForDate(from: Date = new Date()): number {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    if (today.getMonth() === 11 && today.getDate() >= 25) return today.getFullYear() + 1;
    return today.getFullYear();
}

export function availableSeasonYears(from: Date = new Date()): number[] {
    const y = from.getFullYear();
    return [y - 1, y, y + 1, y + 2];
}

/** Period window for a season year — same 14 ranges as analytics `periodMode=beds24`. */
export function resolvePeriodWindow(period: PeriodId, year?: number, from: Date = new Date()): PeriodWindow {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const spec = PERIOD_BOUNDS[period];
    const seasonYear = year ?? seasonYearForDate(today);
    const start = makeDate(spec.wraps ? seasonYear - 1 : seasonYear, spec.start[0], spec.start[1]);
    const end = makeDate(seasonYear, spec.end[0], spec.end[1]);
    return {
        period,
        year: seasonYear,
        start,
        end,
        startIso: ymd(start),
        endIso: ymd(end),
        nights: daysBetween(start, end) + 1,
        daysToArrival: Math.max(0, daysBetween(today, start)),
    };
}

export function overlapNights(
    stayStartIso: string,
    stayEndIso: string,
    periodStartIso: string,
    periodEndExclusiveIso: string,
): number {
    const stayStart = parseIsoDate(stayStartIso);
    // Beds24 departure is exclusive (checkout day).
    const stayEndExcl = parseIsoDate(stayEndIso);
    const pStart = parseIsoDate(periodStartIso);
    const pEndExcl = new Date(parseIsoDate(periodEndExclusiveIso));
    pEndExcl.setDate(pEndExcl.getDate() + 1);

    const start = stayStart > pStart ? stayStart : pStart;
    const end = stayEndExcl < pEndExcl ? stayEndExcl : pEndExcl;
    return Math.max(0, daysBetween(start, end));
}

export function defaultPeriodForToday(from: Date = new Date()): PeriodId {
    const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const year = seasonYearForDate(today);
    for (const id of PERIOD_IDS) {
        const w = resolvePeriodWindow(id, year, today);
        if (today >= w.start && today <= w.end) return id;
    }
    let best: PeriodId = 'P1';
    let bestDays = Infinity;
    for (const id of PERIOD_IDS) {
        const d = resolvePeriodWindow(id, year, today).daysToArrival;
        if (d < bestDays) {
            bestDays = d;
            best = id;
        }
    }
    return best;
}
