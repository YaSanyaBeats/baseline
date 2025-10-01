import { MongoClient } from 'mongodb';

// Connection URI
const uri = `mongodb://${process.env.DATABASE_LOGIN}:${process.env.DATABASE_PASS}@${process.env.DATABASE_URL}:${process.env.DATABASE_PORT}/`;

// Create a new MongoClient
const client = new MongoClient(uri, {
    maxPoolSize: 10,
    socketTimeoutMS: 10000,
});

// Connect to the MongoDB server
function connectDB() {
    try {
        client.connect();
        console.log('Connected to ChiefDB');
    }  
    catch (error: unknown) {
        console.error("Error connect with ChiefDB. Error:", error instanceof Error ? error.message : String(error));
    }
}

function getClient() {
    return client;
}

export { getClient, connectDB };