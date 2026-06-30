const { MongoClient } = require('mongodb');

(async () => {
    const client = new MongoClient('mongodb://localhost:27017/');
    await client.connect();
    const db = client.db('baseline');
    const objects = await db.collection('objects').find({}).toArray();
    for (const o of objects) {
        for (const r of o.roomTypes || []) {
            const n = String(r.name || '').trim();
            if (n.includes('S-407') || n.includes('407') && o.id === 292256) {
                console.log('room', n, 'property', o.id, o.name, 'roomTypeId', r.id);
            }
        }
    }
    const prop292256 = objects.find((o) => o.id === 292256);
    console.log('292256 rooms:', prop292256?.roomTypes?.map((r) => ({ id: r.id, name: r.name })));
    await client.close();
})().catch((e) => { console.error(e); process.exit(1); });
