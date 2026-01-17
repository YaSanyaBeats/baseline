import { MongoClient } from 'mongodb';

// Connection URI
const uri = `mongodb://${process.env.DATABASE_LOGIN}:${process.env.DATABASE_PASS}@${process.env.DATABASE_URL}:${process.env.DATABASE_PORT}/`;
console.log(uri);
// Create a new MongoClient
let client: MongoClient;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
        maxPoolSize: 10,
        socketTimeoutMS: 10000,
    });
    global._mongoClientPromise = client.connect().then((connectedClient) => {
        console.log('Connected to ChiefDB');
        return connectedClient;
    }).catch((error: unknown) => {
        console.error("Error connect with ChiefDB. Error:", error instanceof Error ? error.message : String(error));
        throw error;
    });
}

const clientPromise = global._mongoClientPromise;

// Connect to the MongoDB server
async function connectDB() {
    try {
        await clientPromise;
        console.log('Connected to ChiefDB');
    }  
    catch (error: unknown) {
        console.error("Error connect with ChiefDB. Error:", error instanceof Error ? error.message : String(error));
    }
}

async function getClient() {
    return await clientPromise;
}

export { getClient, connectDB };

