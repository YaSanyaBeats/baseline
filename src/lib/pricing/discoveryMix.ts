import type { CompetitorPlatform } from './types';

/** Сколько ссылок ищем по умолчанию. Ноль — площадку не запрашиваем. */
export const DEFAULT_DISCOVERY_LIMITS: Record<CompetitorPlatform, number> = {
    trip: 8,
    airbnb: 6,
    booking: 6,
    agoda: 0,
};

export const DISCOVERY_PLATFORM_ORDER: CompetitorPlatform[] = ['trip', 'airbnb', 'booking', 'agoda'];

export const DISCOVERY_LIMIT_MAX = 30;

/** Оценка одного поиска rag-web-browser. Совпадает с реестром акторов. */
export const DISCOVERY_SEARCH_USD = 0.02;

export type DiscoveryPart = { platform: CompetitorPlatform; limit: number };

export const DISCOVERY_MIX: DiscoveryPart[] = DISCOVERY_PLATFORM_ORDER.map((platform) => ({
    platform,
    limit: DEFAULT_DISCOVERY_LIMITS[platform],
})).filter((part) => part.limit > 0);

export function parseDiscoveryLimits(raw: unknown): { ok: true; mix: DiscoveryPart[] } | { ok: false; message: string } {
    if (raw == null) return { ok: true, mix: DISCOVERY_MIX };
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, message: 'Некорректный набор площадок' };
    }
    const src = raw as Record<string, unknown>;
    const mix: DiscoveryPart[] = [];
    for (const platform of DISCOVERY_PLATFORM_ORDER) {
        if (src[platform] == null || src[platform] === '') continue;
        const n = Number(src[platform]);
        if (!Number.isInteger(n) || n < 0 || n > DISCOVERY_LIMIT_MAX) {
            return { ok: false, message: `Количество для ${platform} должно быть от 0 до ${DISCOVERY_LIMIT_MAX}` };
        }
        if (n > 0) mix.push({ platform, limit: n });
    }
    if (!mix.length) {
        return { ok: false, message: 'Укажите количество хотя бы для одной площадки' };
    }
    return { ok: true, mix };
}
