import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db/getDB';
import { isPricingSession, requirePricingAccess } from '@/lib/pricing/auth';
import { rebuildClustersFromMetadata } from '@/lib/pricing/clusterMeta';
import { IP_COLLECTIONS } from '@/lib/pricing/collections';
import { writePricingJournal } from '@/lib/pricing/journal';
import { listSavedClusterNames, rememberClusterName } from '@/lib/pricing/clusterNames';
import { ensurePricingSeeded, getRooms } from '@/lib/pricing/seed';

export async function GET() {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    await ensurePricingSeeded();
    const rooms = await getRooms();
    const byCluster = new Map<string, typeof rooms>();
    const unassigned = rooms.filter((r) => !r.cluster || r.needsOnboarding);
    for (const room of rooms.filter((r) => r.cluster && !r.needsOnboarding)) {
        const list = byCluster.get(room.cluster) || [];
        list.push(room);
        byCluster.set(room.cluster, list);
    }
    const savedNames = await listSavedClusterNames();
    for (const name of savedNames) {
        if (!byCluster.has(name)) byCluster.set(name, []);
    }
    const clusters = [...byCluster.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ru'))
        .map(([name, members]) => ({
            name,
            rooms: members,
            units: members.reduce((s, r) => s + r.units, 0),
            floor: members.find((r) => r.floor)?.floor ?? null,
        }));
    return NextResponse.json({
        success: true,
        data: { clusters, unassigned, allNames: clusters.map((c) => c.name) },
    });
}

export async function PATCH(request: NextRequest) {
    const access = await requirePricingAccess();
    if (!isPricingSession(access)) return access;
    const body = await request.json();
    const db = await getDB();
    const col = db.collection(IP_COLLECTIONS.rooms);

    if (body.rebuildFromMetadata === true) {
        await ensurePricingSeeded();
        const result = await rebuildClustersFromMetadata();
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'кластер',
            target: 'metadata',
            detail: `собрано ${result.clusters.length} кластеров, назначено ${result.assigned}, без метаданных ${result.unassigned}`,
        });
        return NextResponse.json({ success: true, data: result });
    }

    if (typeof body.roomId === 'number' && typeof body.cluster === 'string' && body.cluster.trim()) {
        const room = await col.findOne({ roomId: body.roomId });
        const clusterName = body.cluster.trim();
        await rememberClusterName(clusterName);
        await col.updateOne(
            { roomId: body.roomId },
            { $set: { cluster: clusterName, needsOnboarding: false } },
        );
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'кластер',
            target: `${room?.name || body.roomId}`,
            detail: `${room?.cluster || 'без кластера'} → ${clusterName}`,
        });
        return NextResponse.json({ success: true });
    }

    if (typeof body.createCluster === 'string' && body.createCluster.trim()) {
        const name = body.createCluster.trim();
        await rememberClusterName(name);
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'кластер',
            target: name,
            detail: 'создан кластер',
        });
        return NextResponse.json({ success: true, data: { name } });
    }

    if (typeof body.cluster === 'string' && body.floor != null) {
        const floor = Number(body.floor) || 0;
        await col.updateMany({ cluster: body.cluster }, { $set: { floor: floor || null } });
        await writePricingJournal({
            userId: String(access.user._id || access.user.login),
            userName: access.user.name || access.user.login,
            type: 'порог мин. цены',
            target: body.cluster,
            detail: `${floor || 'нет'} ฿`,
        });
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: 'Некорректный запрос' }, { status: 400 });
}
