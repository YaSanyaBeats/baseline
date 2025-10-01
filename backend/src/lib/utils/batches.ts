export async function processInBatches(objects: any[], batchSize: number, callback: Function) {
    const batches = [];
    for (let i = 0; i < objects.length; i += batchSize) {
        batches.push(objects.slice(i, i + batchSize));
    }

    for (const batch of batches) {
        await Promise.all(
            batch.map(async (object) => {
                await callback(object);
            })
        );
    }
}