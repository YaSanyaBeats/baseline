import { NextRequest, NextResponse } from 'next/server';
import { isPricingSession, requirePricingAccess } from './auth';
import { buildEffectBundle, EffectQueryError, type EffectBuildQuery } from './effectChart';
import { DEFAULT_EFFECT_WINDOW, DEFAULT_HORIZON } from './effectMath';
import { addChannelEvent, getPriceChangeById, rollbackPriceChange } from './priceChanges';
import { writePricingJournal } from './journal';
import { defaultPeriodForToday, PERIOD_IDS, seasonYearForDate, type PeriodId } from './periods';
import type { ChannelEventType, EffectScope } from './effectTypes';

function clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseEffectQuery(request: NextRequest): EffectBuildQuery {
    const { searchParams } = new URL(request.url);
    const scopeRaw = searchParams.get('scope') || 'portfolio';
    const scope: EffectScope = scopeRaw === 'room' || scopeRaw === 'cluster' || scopeRaw === 'portfolio' ? scopeRaw : 'portfolio';
    const periodRaw = searchParams.get('period') || defaultPeriodForToday();
    const period = periodRaw === 'custom' || (PERIOD_IDS as readonly string[]).includes(periodRaw) ? (periodRaw as PeriodId | 'custom') : defaultPeriodForToday();
    const year = clampInt(Number(searchParams.get('year')), 2000, 2100, seasonYearForDate());
    const compareRaw = searchParams.get('compare_year');
    const compareYear = compareRaw && compareRaw !== '0' ? clampInt(Number(compareRaw), 2000, 2100, year - 1) : null;
    return {
        scope,
        scopeId: searchParams.get('scope_id') || 'all',
        period,
        year,
        dateFrom: searchParams.get('date_from') || undefined,
        dateTo: searchParams.get('date_to') || undefined,
        effectWindow: clampInt(Number(searchParams.get('effect_window')), 3, 45, DEFAULT_EFFECT_WINDOW),
        compareYear: compareYear === year ? null : compareYear,
        horizon: clampInt(Number(searchParams.get('horizon')), 30, 180, DEFAULT_HORIZON),
    };
}

function fail(error: unknown, fallback: string) {
    if (error instanceof EffectQueryError) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error(fallback, error);
    return NextResponse.json({ success: false, message: fallback }, { status: 500 });
}

export async function effectChartResponse(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    try {
        const bundle = await buildEffectBundle(parseEffectQuery(request));
        return NextResponse.json({ success: true, data: bundle.chart, summary: bundle.summary, options: bundle.options });
    } catch (error) {
        return fail(error, 'Не удалось построить график эффекта');
    }
}

export async function recommendationSummaryResponse(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    try {
        const bundle = await buildEffectBundle(parseEffectQuery(request));
        return NextResponse.json({ success: true, data: bundle.summary });
    } catch (error) {
        return fail(error, 'Не удалось собрать сводку эффективности');
    }
}

export async function snapshotResponse(changeId: string) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    try {
        const row = await getPriceChangeById(decodeURIComponent(changeId));
        if (!row) return NextResponse.json({ success: false, message: 'Снимок не найден' }, { status: 404 });
        return NextResponse.json({ success: true, data: row.snapshot });
    } catch (error) {
        return fail(error, 'Не удалось прочитать снимок');
    }
}

export async function rollbackResponse(changeId: string) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    try {
        const userName = access.user.name || access.user.login;
        const result = await rollbackPriceChange(decodeURIComponent(changeId), userName);
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName,
            type: 'откат цены',
            target: changeId,
            detail: `Возврат к ${result.restored} ฿ для ${result.rooms} комн. Запись в Beds24 не выполняется.`,
        });
        return NextResponse.json({
            success: true,
            data: result,
            message: `Цена возвращена к ${result.restored} ฿ в Baseline. Beds24 не изменён.`,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось откатить цену';
        return NextResponse.json({ success: false, message }, { status: 400 });
    }
}

export async function channelEventResponse(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    try {
        const body = await request.json();
        const id = await addChannelEvent({
            eventAt: String(body.eventAt || ''),
            eventType: String(body.eventType || '') as ChannelEventType,
            description: String(body.description || ''),
            affectedScope: String(body.affectedScope || 'all'),
        });
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'канальное событие',
            target: String(body.affectedScope || 'all'),
            detail: String(body.description || ''),
        });
        return NextResponse.json({ success: true, data: { id } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось сохранить событие';
        return NextResponse.json({ success: false, message }, { status: 400 });
    }
}
