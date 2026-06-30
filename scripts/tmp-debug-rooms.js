const { MongoClient } = require('mongodb');

(async () => {
    const client = new MongoClient('mongodb://localhost:27017/');
    await client.connect();
    const db = client.db('baseline');
    const objects = await db.collection('objects').find({}).toArray();
    const targets = ['S-407', 'D-407', 'D-405', 'D-406'];
    for (const o of objects) {
        for (const r of o.roomTypes || []) {
            const n = String(r.name || '').trim();
            if (targets.includes(n)) {
                console.log('FOUND', n, 'propertyId', o.id, o.name, 'roomTypeId', r.id);
            }
            if ([249861, 610812, 610813, 249840].includes(r.id)) {
                console.log('FOUND roomType id', r.id, 'name', r.name, 'property', o.id, o.name);
            }
        }
    }
    // owner objects by name search
    const owner = await db.collection('users').findOne({ _id: new (require('mongodb').ObjectId)('69416546001179406d5735cf') });
    console.log('Owner objects assignment:', JSON.stringify(owner.objects));
    await client.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
