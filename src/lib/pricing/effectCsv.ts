import type { ChartPayload } from './effectTypes';

function cell(value: string | number | null | undefined): string {
    if (value == null || value === '') return '';
    return String(value).split(';').join(',');
}

export function buildEffectCsv(chart: ChartPayload): string {
    const lines = [
        'days_before;occ_pct;occ_pct_yoy;norm_pct;price_thb;price_yoy;nights_per_day;bookings_per_day;comp_low;comp_median;comp_high',
    ];
    const norm = new Map(chart.pace_norm_series.map((row) => [row.days_before, row.norm_pct]));
    const price = new Map(chart.price_series.map((row) => [row.days_before, row]));
    const books = new Map(chart.bookings_series.map((row) => [row.days_before, row]));
    const comp = new Map(chart.comp_band.map((row) => [row.days_before, row]));
    const occ = new Map(chart.occupancy_series.map((row) => [row.days_before, row]));
    for (let d = chart.meta.horizon_days; d >= 0; d--) {
        const o = occ.get(d);
        const p = price.get(d);
        const b = books.get(d);
        const c = comp.get(d);
        lines.push(
            [
                d,
                cell(o?.occ_pct),
                cell(o?.occ_pct_yoy),
                cell(norm.get(d)),
                cell(p?.price_thb),
                cell(p?.price_yoy),
                cell(b?.nights_per_day),
                cell(b?.bookings_per_day),
                cell(c?.comp_low),
                cell(c?.comp_median),
                cell(c?.comp_high),
            ].join(';'),
        );
    }
    lines.push('');
    lines.push('change_id;days_before;price_before;price_after;initiator;pace_before;pace_after;delta_pace;control_delta;above_control;control_group_size;adr_after;confidence;verdict;alert');
    const changes = new Map(chart.price_changes.map((row) => [row.id, row]));
    for (const row of chart.effect_table) {
        const change = changes.get(row.change_id);
        lines.push(
            [
                row.change_id,
                cell(change?.days_before),
                cell(change?.price_before),
                cell(change?.price_after),
                cell(change?.initiator),
                row.pace_before,
                row.pace_after,
                row.delta_pace,
                cell(row.control_delta),
                cell(row.above_control),
                row.control_group_size,
                cell(row.adr_after),
                row.confidence,
                row.verdict,
                row.alert ? 1 : 0,
            ].join(';'),
        );
    }
    return `\uFEFF${lines.join('\n')}`;
}
