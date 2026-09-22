import mongoose from "mongoose";

/**
 * Connessione MongoDB con cache globale.
 * In dev Next.js ricarica i moduli ad ogni HMR: senza cache si aprirebbero
 * decine di connessioni verso Atlas esaurendo il pool del piano free.
 */

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? {
  conn: null,
  promise: null,
};
global._mongooseCache = cached;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI non definita. Copia .env.example in frontend/.env.local e valorizzala."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB || "subsmate",
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Se la connessione fallisce azzeriamo la promise, altrimenti ogni
    // richiesta successiva rifiuterebbe con lo stesso errore in cache.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
