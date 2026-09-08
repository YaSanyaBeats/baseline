import { getRooms } from '../seed';
import type { CompetitorPlatform } from '../types';
import { isBlockedListingUrl, normalizeCompetitorUrl, upsertClusterCompetitor } from '../competitors';
import { assertCanRun, recordCost } from './budget';
import { runActorOnce } from './gateway';
import { detectPlatform, discoveryActor } from './registry';

const DISTRICT_QUERY: Record<string, string> = {
    Бангтао: 'bangtao',
    Раваи: 'rawai',
    Карон: 'karon',
    Найянг: 'nai yang',
    Майкхао: 'mai khao',
    Ката: 'kata',
    Сурин: 'surin',
    bangtao: 'bangtao',
    rawai: 'rawai',
    karon: 'karon',
    kata: 'kata',
    surin: 'surin',
};

const LISTING_URL_RE =
    /https?:\/\/(?:www\.)?(?:airbnb\.[a-z.]+\/rooms\/\d+|booking\.com\/hotel\/[^\s"'<>\\]+|agoda\.com\/[^\s"'<>\\]+|trip\.com\/hotels\/[^\s"'<>\\]+)/gi;

function districtQuery(name: string): string {
    if (DISTRICT_QUERY[name]) return DISTRICT_QUERY[name];
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(DISTRICT_QUERY)) {
        if (lower.includes(key.toLowerCase()) || lower.includes(value)) return value;
    }
    if (lower.includes('north') || lower.includes('naiyang') || lower.includes('nai yang')) return 'nai yang';
    if (lower.includes('mai khao') || lower.includes('майкхао')) return 'mai khao';
    return name;
}

function parseClusterSearch(cluster: string, rooms: Awaited<ReturnType<typeof getRooms>>) {
    const members = rooms.filter((r) => r.cluster === cluster);
    const district = members.find((r) => r.district)?.district || cluster.split('·')[0]?.trim() || cluster;
    const bedrooms =
        members.find((r) => r.bedrooms != null)?.bedrooms ??
        (/\bстуди|studio/i.test(cluster) ? 0 : /(\d)\s*(спал|br|bed)/i.test(cluster) ? Number(cluster.match(/(\d)/)?.[1]) : null);
    const objectType =
        members.find((r) => r.objectType)?.objectType ||
        (/вилл|villa/i.test(cluster) ? 'villa' : /апарт|apartment/i.test(cluster) ? 'apartments' : null);
    const level = members.find((r) => r.level)?.level || null;
    return { districtQuery: districtQuery(district), bedrooms, objectType, level };
}

export function buildDiscoveryQuery(
    platform: CompetitorPlatform,
    district: string,
    bedrooms: number | null,
    objectType?: 'apartments' | 'villa' | null,
    level?: string | null,
): string {
    const loc = `"${district}" phuket`;
    const br =
        bedrooms == null ? '' : bedrooms <= 0 ? 'studio' : bedrooms === 1 ? '"1 bedroom"' : `"${bedrooms} bedroom"`;
    const kind = objectType === 'villa' ? 'villa' : 'apartment';
    const tier = level === 'premium' || level === 'lux' ? 'luxury' : '';
    const extra =
        platform === 'airbnb' ? `entire ${kind} -hotel` : platform === 'booking' ? kind : kind;
    const site =
        platform === 'airbnb'
            ? 'site:airbnb.com/rooms'
            : platform === 'booking'
              ? 'site:booking.com/hotel'
              : platform === 'agoda'
                ? 'site:agoda.com'
                : 'site:trip.com/hotels';
    return [site, loc, br, extra, tier].filter(Boolean).join(' ');
}

function collectUrls(items: Record<string, unknown>[], platform: CompetitorPlatform): string[] {
    const found = new Set<string>();
    const consider = (raw: string) => {
        const url = normalizeCompetitorUrl(raw);
        if (!url || isBlockedListingUrl(url)) return;
        if (detectPlatform(url) !== platform) return;
        found.add(url);
    };
    for (const item of items) {
        const meta = item.metadata as { url?: string } | undefined;
        if (meta?.url) consider(meta.url);
        if (typeof item.url === 'string') consider(item.url);
        if (typeof item.searchResultUrl === 'string') consider(item.searchResultUrl);
        const blobs = [item.markdown, item.text, item.html, item.query]
            .filter((v) => typeof v === 'string')
            .join('\n');
        const matches = blobs.match(LISTING_URL_RE) || [];
        for (const m of matches) consider(m.replace(/[),.;]+$/, ''));
    }
    return [...found];
}

export async function runClusterDiscovery(params: {
    cluster: string;
    platform: CompetitorPlatform;
    userName: string;
}) {
    const actor = discoveryActor();
    if (!actor) throw new Error('Актор Discovery не в реестре');

    const rooms = await getRooms();
    const { districtQuery: district, bedrooms, objectType, level } = parseClusterSearch(params.cluster, rooms);
    if (!district) throw new Error('Не удалось определить район кластера для поиска');

    const query = buildDiscoveryQuery(params.platform, district, bedrooms, objectType, level);
    const { settings } = await assertCanRun(actor.estimatedUsd);

    const result = await runActorOnce({
        actorId: actor.id,
        platform: 'search',
        cluster: params.cluster,
        url: query,
        userName: params.userName,
        timeoutMs: settings.timeoutMs,
        input: {
            query,
            maxResults: 5,
            outputFormats: ['markdown'],
            scrapingTool: 'raw-http',
            requestTimeoutSecs: 30,
        },
    });

    const urls = collectUrls(result.items, params.platform).slice(0, 8);
    let inserted = 0;
    let skipped = 0;
    const added: string[] = [];
    for (const url of urls) {
        const status = await upsertClusterCompetitor({
            cluster: params.cluster,
            url,
            platform: params.platform,
            name: url,
            bedrooms,
            status: 'candidate',
            source: 'discovery',
        });
        if (status === 'inserted') {
            inserted += 1;
            added.push(url);
        } else skipped += 1;
    }

    await recordCost({
        runId: result.runId,
        actorId: actor.id,
        platform: 'search',
        costUsd: result.costUsd || actor.estimatedUsd,
        usefulItems: inserted,
        runType: 'discovery',
        cluster: params.cluster,
    });

    return {
        query,
        costUsd: result.costUsd || actor.estimatedUsd,
        found: urls.length,
        inserted,
        skipped,
        added,
        status: result.status,
    };
}
