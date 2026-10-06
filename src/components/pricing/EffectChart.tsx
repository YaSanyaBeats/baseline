'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';
import type { ChartPayload } from '@/lib/pricing/effectTypes';

const C = {
    surface: '#162030',
    elevated: '#1e2f42',
    border: '#253647',
    border2: '#1d2e40',
    ink: '#dce8f5',
    ink2: '#8ba3be',
    ink3: '#4d6a85',
    blue: '#3b9eff',
    red: '#e85252',
    purple: '#9b7fd4',
    green: '#3fc48a',
    warn: '#d4a235',
    neutral: '#5a7a96',
    bar: 'rgba(95,168,211,.55)',
    occFill: 'rgba(59,158,255,.12)',
    compFill: 'rgba(155,127,212,.22)',
    grid: 'rgba(37,54,71,.7)',
    tooltip: 'rgba(14,23,34,.96)',
};

export type ChartLayer = 'occ' | 'norm' | 'price' | 'comp' | 'bookings' | 'markers';

const LAYER_ORDER: ChartLayer[] = ['occ', 'norm', 'price', 'comp', 'bookings', 'markers'];
const LAYER_COLOR: Record<ChartLayer, string> = {
    occ: C.blue,
    norm: C.neutral,
    price: C.red,
    comp: C.purple,
    bookings: '#5fa8d3',
    markers: C.warn,
};

type Props = {
    payload: ChartPayload;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    fileStem: string;
};

function num(v: number | null | undefined, digits = 0): string {
    if (v == null || Number.isNaN(v)) return '—';
    return v.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function linePath(points: Array<{ x: number; y: number | null }>): string {
    let d = '';
    let open = false;
    for (const point of points) {
        if (point.y == null || !Number.isFinite(point.y)) {
            open = false;
            continue;
        }
        d += `${open ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        open = true;
    }
    return d;
}

function areaPath(points: Array<{ x: number; y: number | null }>, baseline: number): string {
    const segs: Array<Array<{ x: number; y: number }>> = [];
    let cur: Array<{ x: number; y: number }> = [];
    for (const point of points) {
        if (point.y == null || !Number.isFinite(point.y)) {
            if (cur.length) segs.push(cur);
            cur = [];
            continue;
        }
        cur.push({ x: point.x, y: point.y });
    }
    if (cur.length) segs.push(cur);
    return segs
        .map((seg) => {
            const head = `M${seg[0].x.toFixed(1)},${seg[0].y.toFixed(1)}`;
            const mid = seg.slice(1).map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
            const tail = `L${seg[seg.length - 1].x.toFixed(1)},${baseline}L${seg[0].x.toFixed(1)},${baseline}Z`;
            return head + mid + tail;
        })
        .join('');
}

export default function EffectChart({ payload, selectedId, onSelect, fileStem }: Props) {
    const { t } = useTranslation();
    const boxRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [width, setWidth] = useState(960);
    const [hover, setHover] = useState<number | null>(null);
    const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
    const [layers, setLayers] = useState<Record<ChartLayer, boolean>>({
        occ: true,
        norm: true,
        price: true,
        comp: true,
        bookings: true,
        markers: true,
    });

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const apply = () => setWidth(Math.max(720, Math.floor(el.clientWidth)));
        apply();
        const observer = new ResizeObserver(apply);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const horizon = payload.meta.horizon_days;
    const model = useMemo(() => {
        const H = 380;
        const pad = { l: 54, r: 62, t: 36, b: 42 };
        const iw = Math.max(200, width - pad.l - pad.r);
        const ih = H - pad.t - pad.b;
        const xOf = (d: number) => pad.l + ((horizon - d) / Math.max(horizon, 1)) * iw;
        const yOcc = (v: number) => pad.t + (1 - v / 100) * ih;
        const occ = new Map(payload.occupancy_series.map((row) => [row.days_before, row]));
        const norm = new Map(payload.pace_norm_series.map((row) => [row.days_before, row.norm_pct]));
        const price = new Map(payload.price_series.map((row) => [row.days_before, row]));
        const books = new Map(payload.bookings_series.map((row) => [row.days_before, row]));
        const comp = new Map(payload.comp_band.map((row) => [row.days_before, row]));
        const priceVals: number[] = [];
        if (layers.price) {
            for (const row of payload.price_series) {
                if (row.price_thb != null) priceVals.push(row.price_thb);
                if (row.price_yoy != null) priceVals.push(row.price_yoy);
            }
        }
        if (layers.comp) {
            for (const row of payload.comp_band) priceVals.push(row.comp_low, row.comp_high);
        }
        if (layers.markers) {
            for (const row of payload.price_changes) {
                priceVals.push(row.price_after);
                if (row.price_before != null) priceVals.push(row.price_before);
            }
        }
        const hasPrice = priceVals.length > 0;
        const rawMin = hasPrice ? Math.min(...priceVals) : 0;
        const rawMax = hasPrice ? Math.max(...priceVals) : 1;
        const padPrice = Math.max(100, (rawMax - rawMin) * 0.12);
        const pMin = rawMin - padPrice;
        const pMax = rawMax + padPrice || rawMin + 1;
        const yPrice = (v: number) => pad.t + (1 - (v - pMin) / (pMax - pMin || 1)) * ih;
        const bookMax = Math.max(1, ...payload.bookings_series.map((row) => row.nights_per_day));
        const baseline = pad.t + ih;
        const days = Array.from({ length: horizon + 1 }, (_, i) => horizon - i);
        const occPts = days.map((d) => ({ x: xOf(d), y: layers.occ && occ.get(d)?.occ_pct != null ? yOcc(occ.get(d)!.occ_pct as number) : null }));
        const yoyPts = days.map((d) => ({ x: xOf(d), y: layers.occ && occ.get(d)?.occ_pct_yoy != null ? yOcc(occ.get(d)!.occ_pct_yoy as number) : null }));
        const normPts = days.map((d) => ({ x: xOf(d), y: layers.norm && norm.has(d) ? yOcc(norm.get(d) as number) : null }));
        const pricePts = days.map((d) => ({ x: xOf(d), y: layers.price && price.get(d)?.price_thb != null ? yPrice(price.get(d)!.price_thb as number) : null }));
        const priceYoyPts = days.map((d) => ({ x: xOf(d), y: layers.price && price.get(d)?.price_yoy != null ? yPrice(price.get(d)!.price_yoy as number) : null }));
        const slot = iw / Math.max(horizon, 1);
        return {
            H, pad, iw, ih, xOf, yOcc, yPrice, baseline, hasPrice, pMin, pMax, bookMax, slot, days, occ, norm, price, books, comp, occPts, yoyPts, normPts, pricePts, priceYoyPts,
        };
    }, [payload, layers, width, horizon]);

    const hoverRow = hover == null ? null : {
        d: hover,
        occ: payload.occupancy_series.find((row) => row.days_before === hover),
        norm: payload.pace_norm_series.find((row) => row.days_before === hover),
        price: payload.price_series.find((row) => row.days_before === hover),
        book: payload.bookings_series.find((row) => row.days_before === hover),
        comp: payload.comp_band.find((row) => row.days_before === hover),
        changes: payload.price_changes.filter((row) => row.days_before === hover),
        events: payload.external_events.filter((row) => row.days_before === hover),
    };

    const exportPng = () => {
        const svg = svgRef.current;
        if (!svg) return;
        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', '380');
        bg.setAttribute('fill', C.surface);
        clone.insertBefore(bg, clone.firstChild);
        const xml = new XMLSerializer().serializeToString(clone);
        const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width * 2;
            canvas.height = 380 * 2;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = C.surface;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0, width, 380);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${fileStem}.png`;
            a.click();
            URL.revokeObjectURL(url);
        };
        img.src = url;
    };

    const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * width;
        if (px < model.pad.l || px > width - model.pad.r) {
            setHover(null);
            return;
        }
        const d = horizon - ((px - model.pad.l) / model.iw) * horizon;
        setHover(Math.max(0, Math.min(horizon, Math.round(d))));
        setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };

    const yTicks = [0, 20, 40, 60, 80, 100];
    const xStep = horizon > 140 ? 20 : 10;
    const xTicks = [];
    for (let d = horizon; d >= 0; d -= xStep) xTicks.push(d);
    if (xTicks[xTicks.length - 1] !== 0) xTicks.push(0);

    return (
        <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1.25, borderRight: `1px solid ${C.border}` }}>
                    {LAYER_ORDER.map((key) => (
                        <Box
                            key={key}
                            component="button"
                            type="button"
                            onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1,
                                py: 0.5,
                                borderRadius: '4px',
                                border: '1px solid',
                                borderColor: layers[key] ? C.border : 'transparent',
                                bgcolor: layers[key] ? C.elevated : 'transparent',
                                color: layers[key] ? C.ink : C.ink2,
                                cursor: 'pointer',
                                font: '11.5px Inter, Arial, sans-serif',
                            }}
                        >
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: LAYER_COLOR[key] }} />
                            {t(`pricing.effect.layers.${key}`)}
                        </Box>
                    ))}
                </Box>
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', px: 1.25 }}>
                    <Box
                        component="button"
                        type="button"
                        onClick={exportPng}
                        sx={{
                            border: `1px solid ${C.border}`,
                            bgcolor: C.elevated,
                            color: C.ink,
                            borderRadius: '4px',
                            px: 1.25,
                            py: 0.5,
                            cursor: 'pointer',
                            font: '12px Inter, Arial, sans-serif',
                        }}
                    >
                        {t('pricing.effect.exportPng')}
                    </Box>
                </Box>
            </Box>
            <Box ref={boxRef} sx={{ position: 'relative', overflowX: 'auto' }}>
                <svg
                    ref={svgRef}
                    width={width}
                    height={380}
                    viewBox={`0 0 ${width} 380`}
                    role="img"
                    aria-label={t('pricing.effect.title')}
                    onMouseMove={onMove}
                    onMouseLeave={() => setHover(null)}
                    style={{ display: 'block' }}
                >
                    {yTicks.map((tick) => (
                        <g key={tick}>
                            <line x1={model.pad.l} x2={width - model.pad.r} y1={model.yOcc(tick)} y2={model.yOcc(tick)} stroke={C.grid} strokeWidth={0.6} />
                            <text x={model.pad.l - 8} y={model.yOcc(tick) + 3} fill={C.blue} fontSize={10} textAnchor="end" fontFamily="ui-monospace, monospace">
                                {tick}
                            </text>
                        </g>
                    ))}
                    {model.hasPrice && (layers.price || layers.comp) && [0, 0.25, 0.5, 0.75, 1].map((k) => {
                        const value = model.pMin + (model.pMax - model.pMin) * k;
                        return (
                            <text key={k} x={width - model.pad.r + 8} y={model.yPrice(value) + 3} fill={C.red} fontSize={10} fontFamily="ui-monospace, monospace">
                                {Math.round(value).toLocaleString('ru-RU')}
                            </text>
                        );
                    })}
                    {xTicks.map((d) => (
                        <text key={d} x={model.xOf(d)} y={380 - 16} fill={C.ink3} fontSize={10} textAnchor="middle" fontFamily="ui-monospace, monospace">
                            {d === 0 ? t('pricing.effect.arrival') : `${d}${t('pricing.effect.dayShort')}`}
                        </text>
                    ))}
                    <text x={model.pad.l} y={374} fill={C.ink3} fontSize={11}>{t('pricing.effect.axisDays')}</text>
                    <text x={14} y={18} fill={C.blue} fontSize={11}>{t('pricing.effect.axisOcc')}</text>
                    {model.hasPrice && <text x={width - 8} y={18} fill={C.red} fontSize={11} textAnchor="end">{t('pricing.effect.axisPrice')}</text>}

                    {layers.comp && payload.comp_band.map((row) => (
                        <rect
                            key={row.days_before}
                            x={model.xOf(row.days_before) - model.slot / 2}
                            y={model.yPrice(row.comp_high)}
                            width={Math.max(2, model.slot)}
                            height={Math.max(2, model.yPrice(row.comp_low) - model.yPrice(row.comp_high))}
                            fill={C.compFill}
                        />
                    ))}
                    {layers.bookings && payload.bookings_series.map((row) => {
                        const h = (row.nights_per_day / model.bookMax) * model.ih * 0.32;
                        if (h <= 0) return null;
                        return (
                            <rect
                                key={row.days_before}
                                x={model.xOf(row.days_before) - Math.max(1, model.slot * 0.28)}
                                y={model.baseline - h}
                                width={Math.max(1.5, model.slot * 0.55)}
                                height={h}
                                fill={C.bar}
                            />
                        );
                    })}
                    {layers.occ && <path d={areaPath(model.occPts, model.baseline)} fill={C.occFill} />}
                    {layers.occ && <path d={linePath(model.occPts)} fill="none" stroke={C.blue} strokeWidth={2.4} />}
                    {layers.occ && payload.meta.compare_year != null && (
                        <path d={linePath(model.yoyPts)} fill="none" stroke={C.blue} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.75} />
                    )}
                    {layers.norm && <path d={linePath(model.normPts)} fill="none" stroke={C.neutral} strokeWidth={1.5} strokeDasharray="6 4" />}
                    {layers.price && <path d={linePath(model.pricePts)} fill="none" stroke={C.red} strokeWidth={2} />}
                    {layers.price && payload.meta.compare_year != null && (
                        <path d={linePath(model.priceYoyPts)} fill="none" stroke={C.red} strokeWidth={1.3} strokeDasharray="5 4" opacity={0.7} />
                    )}
                    {layers.markers && payload.external_events.map((event) => (
                        <g key={event.id} onClick={() => onSelect?.(event.id)} style={{ cursor: 'pointer' }}>
                            <line x1={model.xOf(event.days_before)} x2={model.xOf(event.days_before)} y1={model.pad.t} y2={model.baseline} stroke={C.warn} strokeWidth={1.4} strokeDasharray="4 3" />
                            <circle cx={model.xOf(event.days_before)} cy={model.pad.t + 22} r={4.5} fill={C.warn} />
                        </g>
                    ))}
                    {layers.markers && payload.price_changes.map((change) => {
                        const delta = change.price_before == null ? null : change.price_after - change.price_before;
                        const label = delta == null ? '' : `${delta > 0 ? '+' : ''}${delta}฿`;
                        return (
                            <g key={change.id} onClick={() => onSelect?.(change.id)} style={{ cursor: 'pointer' }}>
                                <line
                                    x1={model.xOf(change.days_before)}
                                    x2={model.xOf(change.days_before)}
                                    y1={model.pad.t}
                                    y2={model.baseline}
                                    stroke={selectedId === change.id ? C.ink : C.red}
                                    strokeWidth={selectedId === change.id ? 2.4 : 1.5}
                                />
                                <circle cx={model.xOf(change.days_before)} cy={model.pad.t + 8} r={4.5} fill={C.red} />
                                {label && (
                                    <text x={model.xOf(change.days_before)} y={model.pad.t - 4} fill={C.red} fontSize={10} textAnchor="middle" fontFamily="ui-monospace, monospace" fontWeight={700}>
                                        {label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    {hover != null && (
                        <line x1={model.xOf(hover)} x2={model.xOf(hover)} y1={model.pad.t} y2={model.baseline} stroke={C.ink2} strokeWidth={1} opacity={0.45} />
                    )}
                </svg>
                {hoverRow && tip && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: Math.min(tip.x + 12, width - 280),
                            top: Math.max(8, tip.y - 12),
                            bgcolor: C.tooltip,
                            border: `1px solid ${C.border}`,
                            color: C.ink2,
                            borderRadius: '6px',
                            px: 1.25,
                            py: 1,
                            fontSize: 12,
                            pointerEvents: 'none',
                            maxWidth: 280,
                            zIndex: 2,
                        }}
                    >
                        <Box sx={{ color: C.ink, fontWeight: 600, mb: 0.5 }}>
                            {hoverRow.d === 0 ? t('pricing.effect.arrival') : `${t('pricing.effect.tooltipDays')} ${hoverRow.d}`}
                        </Box>
                        {layers.occ && <div>{t('pricing.effect.layers.occ')}: {num(hoverRow.occ?.occ_pct, 1)}%</div>}
                        {layers.norm && <div>{t('pricing.effect.layers.norm')}: {num(hoverRow.norm?.norm_pct, 1)}%</div>}
                        {layers.price && <div>{t('pricing.effect.layers.price')}: {num(hoverRow.price?.price_thb)} ฿</div>}
                        {layers.comp && hoverRow.comp && (
                            <div>{t('pricing.effect.layers.comp')}: {num(hoverRow.comp.comp_low)}–{num(hoverRow.comp.comp_high)} ฿</div>
                        )}
                        {layers.bookings && <div>{t('pricing.effect.layers.bookings')}: {num(hoverRow.book?.nights_per_day, 1)}</div>}
                        {hoverRow.changes.map((change) => (
                            <Box key={change.id} sx={{ color: C.red, mt: 0.5 }}>
                                {change.price_before == null ? '—' : num(change.price_before)} → {num(change.price_after)} ฿
                                <Box sx={{ color: C.ink2 }}>{change.snapshot.reason.slice(0, 220)}</Box>
                            </Box>
                        ))}
                        {hoverRow.events.map((event) => (
                            <Box key={event.id} sx={{ color: C.warn, mt: 0.5 }}>{event.description}</Box>
                        ))}
                    </Box>
                )}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, px: 2, py: 1.25, borderTop: `1px solid ${C.border2}`, color: C.ink2, fontSize: 11.5 }}>
                <Legend swatch={C.blue} label={t('pricing.effect.legend.occ')} />
                <Legend swatch={C.neutral} dashed label={t('pricing.effect.legend.norm')} />
                <Legend swatch={C.red} label={t('pricing.effect.legend.price')} />
                <Legend swatch={C.purple} band label={t('pricing.effect.legend.comp')} />
                <Legend swatch="#5fa8d3" box label={t('pricing.effect.legend.bookings')} />
                <Legend swatch={C.red} marker label={t('pricing.effect.legend.priceMarker')} />
                <Legend swatch={C.warn} marker label={t('pricing.effect.legend.eventMarker')} />
            </Box>
        </Box>
    );
}

function Legend({ swatch, label, dashed, band, box, marker }: { swatch: string; label: string; dashed?: boolean; band?: boolean; box?: boolean; marker?: boolean }) {
    return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box
                sx={{
                    width: marker ? 2 : box ? 10 : 20,
                    height: band ? 10 : marker ? 12 : box ? 10 : 3,
                    borderRadius: box || band ? '2px' : 0,
                    bgcolor: dashed ? 'transparent' : swatch,
                    opacity: band ? 0.7 : 1,
                    backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${swatch} 0 5px, transparent 5px 8px)` : undefined,
                }}
            />
            {label}
        </Box>
    );
}
