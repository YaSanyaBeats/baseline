import { getClient } from './connect'
import { Db } from 'mongodb';

// Cache the database instance
let cachedDb: Db | null = null;

export async function getDB(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }
    
    const client = await getClient();
    cachedDb = client.db('baseline');
    return cachedDb;
}

export default getDB;

