import type { Confidence, EffectVerdict, PriceMode } from './effectTypes';

export const CONTROL_THRESHOLD = 0.5;
export const DEFAULT_HORIZON = 120;
export const DEFAULT_EFFECT_WINDOW = 14;
const BANGKOK = 'Asia/Bangkok';

export function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

export function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

export function bangkokDay(input: Date): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BANGKOK,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(input);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return new Date(n('year'), n('month') - 1, n('day'));
}

export function bangkokKey(input: Date): string {
    const d = bangkokDay(input);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

export function ymd(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

export function interpolateAnchors(daysBefore: number, anchors: Array<[number, number]>): number {
    const pts = [...anchors].sort((a, b) => b[0] - a[0]);
    if (!pts.length) return 0;
    if (daysBefore >= pts[0][0]) return pts[0][1];
    const last = pts[pts.length - 1];
    if (daysBefore <= last[0]) return last[1];
    for (let i = 0; i < pts.length - 1; i++) {
        const [d1, v1] = pts[i];
        const [d2, v2] = pts[i + 1];
        if (daysBefore <= d1 && daysBefore >= d2) {
            const span = d1 - d2 || 1;
            const k = (d1 - daysBefore) / span;
            return v1 + (v2 - v1) * k;
        }
    }
    return last[1];
}

export function normAnchors(cell: {
    pickupNorm60d: number;
    pickupNorm30d: number;
    pickupNorm14d: number;
    occNorm: number;
}): Array<[number, number]> {
    const p60 = cell.pickupNorm60d;
    return [
        [120, clamp(p60 * 0.5, 0, 100)],
        [90, clamp(p60 * 0.75, 0, 100)],
        [60, clamp(p60, 0, 100)],
        [30, clamp(cell.pickupNorm30d, 0, 100)],
        [14, clamp(cell.pickupNorm14d, 0, 100)],
        [0, clamp(cell.occNorm, 0, 100)],
    ];
}

export function mapPricingMode(
    regime: string | null | undefined,
    daysToArrival?: number | null,
    windowMed?: number | null,
): PriceMode {
    if (daysToArrival != null && windowMed != null && windowMed > 0 && daysToArrival <= windowMed) {
        return 'LASTMINUTE';
    }
    if (regime === 'HIGH') return 'HIGH';
    if (regime === 'LOW') return 'LOW';
    return 'NORM';
}

export function verdictFromAbove(above: number | null, controlSize: number, threshold = CONTROL_THRESHOLD): EffectVerdict {
    if (controlSize < 1 || above == null || Number.isNaN(above)) return 'neutral';
    if (above > threshold) return 'confirmed';
    if (above < -threshold) return 'bad';
    return 'neutral';
}

export function confidenceLevel(input: {
    controlSize: number;
    yoy: boolean;
    above: number | null;
    windowComplete: boolean;
    afterDays: number;
}): Confidence {
    let level: Confidence;
    if (input.controlSize >= 3 && input.yoy && (input.above ?? -Infinity) > 1) level = 'high';
    else if (input.controlSize >= 2 || input.yoy) level = 'medium';
    else level = 'low';
    if (!input.windowComplete && level === 'high') level = 'medium';
    if (input.afterDays < 3) level = 'low';
    return level;
}

export function median(values: number[]): number | null {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(sorted: number[], q: number): number {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const next = sorted[base + 1];
    if (next == null) return sorted[base];
    const rest = pos - base;
    return sorted[base] + rest * (next - sorted[base]);
}

export function initiatorBucket(initiator: string): 'engine' | 'manager' | 'override' {
    if (initiator.startsWith('override')) return 'override';
    if (initiator.startsWith('manager')) return 'manager';
    return 'engine';
}
