import { connectDB } from './connect';

let isConnected = false;

export async function initDB() {
    if (!isConnected) {
        await connectDB();
        isConnected = true;
    }
}

