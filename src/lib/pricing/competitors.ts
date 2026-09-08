import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from './collections';
import type { CompetitorPlatform, CompetitorStatus } from './types';

const STATUS_RANK: Record<string, number> = {
    approved: 3,
    candidate: 2,
    excluded: 1,
    blocked: 0,
};

export function normalizeCompetitorUrl(raw: string): string {
    const trimmed = raw.trim();
    try {
        const u = new URL(trimmed);
        u.hash = '';
        const host = u.hostname.toLowerCase();
        if (host.includes('airbnb.')) {
            const m = u.pathname.match(/\/rooms\/(\d+)/i);
            if (m) return `${u.protocol}//${host}/rooms/${m[1]}`;
        }
        u.search = '';
        return u.toString().replace(/\/$/, '');
    } catch {
        return trimmed;
    }
}

export function isBlockedListingUrl(url: string): boolean {
    const u = url.toLowerCase();
    return u.includes('holycow') || u.includes('holy-cow') || u.includes('holy_cow');
}

export async function ensureCompetitorsOnCluster(): Promise<void> {
    const db = await getDB();
    const col = db.collection(IP_COLLECTIONS.competitors);
    const rooms = await db
        .collection(IP_COLLECTIONS.rooms)
        .find({}, { projection: { roomId: 1, cluster: 1 } })
        .toArray();
    const clusterByRoom = new Map(rooms.map((r) => [Number(r.roomId), String(r.cluster || '')]));
    const rows = await col.find({}).toArray();

    for (const row of rows) {
        const url = normalizeCompetitorUrl(String(row.url || ''));
        const fromRoom = clusterByRoom.get(Number(row.roomId)) || '';
        const cluster = String(row.cluster || fromRoom || '').trim();
        const patch: Record<string, unknown> = {};
        if (url && url !== row.url) patch.url = url;
        if (cluster && cluster !== row.cluster) patch.cluster = cluster;
        if (Object.keys(patch).length) {
            await col.updateOne({ _id: row._id }, { $set: patch });
        }
    }

    const after = await col.find({}).toArray();
    const groups = new Map<string, typeof after>();
    for (const row of after) {
        const cluster = String(row.cluster || '');
        const url = normalizeCompetitorUrl(String(row.url || ''));
        if (!cluster || !url) continue;
        const key = `${cluster}::${url.toLowerCase()}`;
        const list = groups.get(key) || [];
        list.push(row);
        groups.set(key, list);
    }
    const dropIds = [];
    for (const list of groups.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => {
            const sa = STATUS_RANK[String(a.status)] ?? 0;
            const sb = STATUS_RANK[String(b.status)] ?? 0;
            if (sb !== sa) return sb - sa;
            const pa = a.lastPrice != null ? 1 : 0;
            const pb = b.lastPrice != null ? 1 : 0;
            return pb - pa;
        });
        dropIds.push(...list.slice(1).map((d) => d._id));
    }
    if (dropIds.length) await col.deleteMany({ _id: { $in: dropIds } });
}

export async function remapCompetitorsAfterClusterRename(oldToNew: Map<string, Set<string>>): Promise<void> {
    const db = await getDB();
    const col = db.collection(IP_COLLECTIONS.competitors);
    const rows = await col.find({}).toArray();
    for (const row of rows) {
        const oldCluster = String(row.cluster || '');
        const targets = oldToNew.get(oldCluster);
        if (!targets || !targets.size) continue;
        const names = [...targets];
        const primary = names[0];
        if (primary && primary !== oldCluster) {
            await col.updateOne({ _id: row._id }, { $set: { cluster: primary } });
        }
        for (const extra of names.slice(1)) {
            const url = normalizeCompetitorUrl(String(row.url || ''));
            const exists = await col.findOne({ cluster: extra, url });
            if (exists) continue;
            const { _id: _ignored, ...rest } = row;
            await col.insertOne({ ...rest, cluster: extra, url });
        }
    }
    await ensureCompetitorsOnCluster();
}

export async function upsertClusterCompetitor(params: {
    cluster: string;
    url: string;
    platform: CompetitorPlatform;
    name?: string;
    bedrooms?: number | null;
    sqm?: number | null;
    view?: string | null;
    status?: CompetitorStatus;
    source?: 'manual' | 'seed' | 'discovery';
    isReference?: boolean;
}): Promise<'inserted' | 'exists' | 'blocked'> {
    const cluster = params.cluster.trim();
    const url = normalizeCompetitorUrl(params.url);
    if (!cluster || !url) return 'exists';
    if (isBlockedListingUrl(url)) return 'blocked';

    const db = await getDB();
    const col = db.collection(IP_COLLECTIONS.competitors);
    const existing = await col.findOne({ cluster, url });
    if (existing) {
        if (existing.status === 'blocked') return 'blocked';
        return 'exists';
    }
    await col.insertOne({
        cluster,
        roomId: null,
        platform: params.platform,
        url,
        name: params.name || url,
        bedrooms: params.bedrooms ?? null,
        sqm: params.sqm ?? null,
        view: params.view ?? null,
        status: params.status || 'approved',
        isReference: Boolean(params.isReference),
        lastPrice: null,
        lastSiteAnchor: null,
        lastAvailability: null,
        lastRating: null,
        lastReviews: null,
        lastStayNights: null,
        lastWarnings: [],
        lastScrapedAt: null,
        updatedAt: null,
        source: params.source || 'manual',
    });
    return 'inserted';
}
