import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { detectPlatform } from '@/lib/pricing/apify/registry';
import { listSavedClusterNames, rememberClusterName } from '@/lib/pricing/clusterNames';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { ensureCompetitorsOnCluster, normalizeCompetitorUrl, upsertClusterCompetitor } from '@/lib/pricing/competitors';
import { writePricingJournal } from '@/lib/pricing/journal';
import { ensurePricingSeeded, getRooms } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    await ensureCompetitorsOnCluster();
    const db = await getDB();
    const [competitors, rooms] = await Promise.all([
        db.collection(IP_COLLECTIONS.competitors).find({}).toArray(),
        getRooms(),
    ]);
    const serialized = competitors.map((c) => ({
        ...c,
        _id: String(c._id),
        cluster: String(c.cluster || ''),
        roomId: c.roomId == null ? null : Number(c.roomId),
        status: String(c.status || 'approved'),
        source: String(c.source || 'manual'),
        lastPrice: c.lastPrice == null ? null : Number(c.lastPrice),
        lastRating: c.lastRating == null ? null : Number(c.lastRating),
        lastReviews: c.lastReviews == null ? null : Number(c.lastReviews),
        lastStayNights: c.lastStayNights == null ? null : Number(c.lastStayNights),
        lastPriceByStay: c.lastPriceByStay || {},
        lastWarnings: Array.isArray(c.lastWarnings) ? c.lastWarnings : [],
        lastScrapedAt: c.lastScrapedAt
            ? new Date(c.lastScrapedAt as Date).toISOString()
            : c.updatedAt
              ? new Date(c.updatedAt as Date).toISOString()
              : null,
        updatedAt: c.updatedAt ? new Date(c.updatedAt as Date).toISOString() : null,
    }));
    const byCluster = new Map<string, typeof serialized>();
    for (const c of serialized) {
        if (!c.cluster) continue;
        const list = byCluster.get(c.cluster) || [];
        list.push(c);
        byCluster.set(c.cluster, list);
    }
    const data = rooms
        .filter((r) => r.cluster)
        .reduce<Array<{ cluster: string; rooms: typeof rooms }>>((acc, room) => {
            const row = acc.find((x) => x.cluster === room.cluster);
            if (row) row.rooms.push(room);
            else acc.push({ cluster: room.cluster, rooms: [room] });
            return acc;
        }, [])
        .map(({ cluster, rooms: members }) => clusterRow(cluster, members, byCluster.get(cluster) || []));
    const present = new Set(data.map((row) => row.cluster));
    const savedNames = await listSavedClusterNames();
    for (const name of savedNames) {
        if (present.has(name)) continue;
        data.push(clusterRow(name, [], byCluster.get(name) || []));
    }
    data.sort((a, b) => a.cluster.localeCompare(b.cluster, 'ru'));
    return NextResponse.json({ success: true, data });
}

const STATUS_ORDER: Record<string, number> = { approved: 0, candidate: 1, blocked: 2, excluded: 3 };

function clusterRow<T extends { status: string; platform?: string }>(
    cluster: string,
    members: Array<{ roomId: number; name: string }>,
    list: T[],
) {
    const sorted = [...list].sort((a, b) => {
        const byStatus = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (byStatus !== 0) return byStatus;
        return String(a.platform || '').localeCompare(String(b.platform || ''));
    });
    const approved = sorted.filter((c) => c.status === 'approved');
    return {
        cluster,
        objects: members.length,
        covered: approved.length > 0 ? members.length : 0,
        coverage: approved.length > 0 ? 1 : 0,
        approved: approved.length,
        total: sorted.length,
        competitors: sorted,
        rooms: members.map((m) => ({ roomId: m.roomId, name: m.name })),
    };
}

export async function POST(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const rooms = await getRooms();
    const cluster =
        typeof body.cluster === 'string' && body.cluster.trim()
            ? body.cluster.trim()
            : rooms.find((r) => r.roomId === Number(body.roomId))?.cluster || '';
    const urls: string[] = Array.isArray(body.urls) ? body.urls : body.url ? [String(body.url)] : [];
    if (!cluster || !urls.length) {
        return NextResponse.json({ success: false, message: 'Нужны cluster (или roomId) и url / urls' }, { status: 400 });
    }
    let added = 0;
    for (const raw of urls) {
        const url = String(raw).trim();
        if (!url) continue;
        const platform = detectPlatform(url);
        if (!platform) {
            return NextResponse.json({ success: false, message: `Неизвестная площадка: ${url}` }, { status: 400 });
        }
        const result = await upsertClusterCompetitor({
            cluster,
            url,
            platform,
            name: body.name || url,
            bedrooms: body.bedrooms ?? null,
            sqm: body.sqm ?? null,
            view: body.view ?? null,
            status: 'approved',
            source: 'manual',
            isReference: Boolean(body.isReference),
        });
        if (result === 'inserted') added += 1;
    }
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: 'comp set +',
        target: cluster,
        detail: urls.join(', '),
    });
    return NextResponse.json({ success: true, added });
}

export async function PATCH(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, message: 'Нужен id' }, { status: 400 });
    const db = await getDB();
    const col = db.collection(IP_COLLECTIONS.competitors);
    const current = await col.findOne({ _id: new ObjectId(String(body.id)) });
    if (!current) return NextResponse.json({ success: false, message: 'Конкурент не найден' }, { status: 404 });

    const set: Record<string, unknown> = {};
    if (body.status) set.status = body.status;
    if (typeof body.isReference === 'boolean') set.isReference = body.isReference;
    if (typeof body.name === 'string' && body.name.trim()) set.name = body.name.trim();

    const nextCluster =
        typeof body.cluster === 'string' && body.cluster.trim() ? body.cluster.trim() : String(current.cluster || '');
    let nextUrl = normalizeCompetitorUrl(String(current.url || ''));
    if (typeof body.url === 'string' && body.url.trim()) {
        nextUrl = normalizeCompetitorUrl(body.url.trim());
        const platform = detectPlatform(nextUrl);
        if (!platform) {
            return NextResponse.json({ success: false, message: `Неизвестная площадка: ${body.url}` }, { status: 400 });
        }
        set.url = nextUrl;
        set.platform = platform;
    }
    if (nextCluster && nextCluster !== String(current.cluster || '')) {
        set.cluster = nextCluster;
        await rememberClusterName(nextCluster);
    }
    if (set.url || set.cluster) {
        const dup = await col.findOne({
            cluster: nextCluster,
            url: nextUrl,
            _id: { $ne: current._id },
        });
        if (dup) {
            if (set.cluster && !set.url && dup.status !== 'blocked') {
                await col.deleteOne({ _id: current._id });
                return NextResponse.json({ success: true, moved: 'already-there' });
            }
            return NextResponse.json(
                { success: false, message: 'Такая ссылка уже есть у этого объекта' },
                { status: 400 },
            );
        }
    }
    if (!Object.keys(set).length) return NextResponse.json({ success: true });
    set.updatedAt = new Date();
    await col.updateOne({ _id: current._id }, { $set: set });
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: body.status === 'blocked' ? 'comp set ✕' : 'comp set',
        target: String(body.id),
        detail: JSON.stringify(set),
    });
    return NextResponse.json({ success: true });
}
