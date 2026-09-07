import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { detectPlatform } from '@/lib/pricing/apify/registry';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { ensurePricingSeeded, getRooms } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const db = await getDB();
    const [competitors, rooms] = await Promise.all([
        db.collection(IP_COLLECTIONS.competitors).find({}).toArray(),
        getRooms(),
    ]);
    const serialized = competitors.map((c) => ({
        ...c,
        _id: String(c._id),
        roomId: Number(c.roomId),
        status: String(c.status || 'approved'),
    }));
    const byRoom = new Map<number, typeof serialized>();
    for (const c of serialized) {
        const list = byRoom.get(c.roomId) || [];
        list.push(c);
        byRoom.set(c.roomId, list);
    }
    const clusters = new Map<string, Array<{ room: (typeof rooms)[number]; competitors: typeof serialized }>>();
    for (const room of rooms.filter((r) => r.cluster)) {
        const list = clusters.get(room.cluster) || [];
        list.push({ room, competitors: byRoom.get(room.roomId) || [] });
        clusters.set(room.cluster, list);
    }
    const data = [...clusters.entries()].map(([cluster, members]) => {
        const covered = members.filter((m) => m.competitors.some((c) => c.status === 'approved')).length;
        return {
            cluster,
            objects: members.length,
            covered,
            coverage: members.length ? covered / members.length : 0,
            rooms: members.map((m) => ({
                roomId: m.room.roomId,
                name: m.room.name,
                competitors: m.competitors,
            })),
        };
    });
    return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const roomId = Number(body.roomId);
    const urls: string[] = Array.isArray(body.urls) ? body.urls : body.url ? [String(body.url)] : [];
    if (!roomId || !urls.length) {
        return NextResponse.json({ success: false, message: 'Нужны roomId и url / urls' }, { status: 400 });
    }
    const db = await getDB();
    const docs = [];
    for (const raw of urls) {
        const url = String(raw).trim();
        if (!url) continue;
        const platform = detectPlatform(url);
        if (!platform) {
            return NextResponse.json({ success: false, message: `Неизвестная площадка: ${url}` }, { status: 400 });
        }
        docs.push({
            roomId,
            platform,
            url,
            name: body.name || url,
            bedrooms: body.bedrooms ?? null,
            sqm: body.sqm ?? null,
            view: body.view ?? null,
            status: 'approved',
            isReference: Boolean(body.isReference),
            lastPrice: null,
            lastSiteAnchor: null,
            lastAvailability: null,
            updatedAt: null,
        });
    }
    if (docs.length) await db.collection(IP_COLLECTIONS.competitors).insertMany(docs);
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: 'comp set +',
        target: `#${roomId}`,
        detail: docs.map((d) => d.url).join(', '),
    });
    return NextResponse.json({ success: true, added: docs.length });
}

export async function PATCH(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ success: false, message: 'Нужен id' }, { status: 400 });
    const db = await getDB();
    const set: Record<string, unknown> = {};
    if (body.status) set.status = body.status;
    if (typeof body.isReference === 'boolean') set.isReference = body.isReference;
    if (body.name) set.name = body.name;
    await db.collection(IP_COLLECTIONS.competitors).updateOne({ _id: new ObjectId(String(body.id)) }, { $set: set });
    await writePricingJournal({
        userId: String(access.user._id || access.user.login),
        userName: access.user.name || access.user.login,
        type: body.status === 'blocked' ? 'comp set ✕' : 'comp set',
        target: String(body.id),
        detail: JSON.stringify(set),
    });
    return NextResponse.json({ success: true });
}
