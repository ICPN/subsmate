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

// Dentro inTransaction() ogni query riceve la sessione da sola: senza, una
// sola chiamata che la dimentica scriverebbe fuori dalla transazione.
mongoose.set("transactionAsyncLocalStorage", true);

/**
 * Esegue `fn` in una transazione: o tutte le scritture o nessuna. Il driver
 * la ritenta da capo sui conflitti di scrittura, quindi `fn` rilegge tutto
 * ciò che decide e non ha effetti fuori dal database.
 *
 * Richiede un replica set (Atlas): il MongoDB locale standalone non supporta
 * le transazioni.
 */
export async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const { connection } = await connectToDatabase();
  let result: T | undefined;
  await connection.transaction(async () => {
    result = await fn();
  });
  return result as T;
}
