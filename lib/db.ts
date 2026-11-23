import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as { _chempulseMongo?: Promise<MongoClient> };

export function hasMongo() {
  return Boolean(process.env.MONGODB_URI);
}

/** One shared connection per server instance. */
export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  globalForMongo._chempulseMongo ??= new MongoClient(uri, {
    appName: "chempulse-web",
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
  }).connect();
  const client = await globalForMongo._chempulseMongo;
  return client.db(process.env.MONGODB_DB || "chempulse");
}
