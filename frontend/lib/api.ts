import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import mongoose from "mongoose";

/** Helper condivisi dalle route handler: risposte uniformi e gestione errori. */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** Valida il body JSON con uno schema Zod, restituendo l'errore già formattato. */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, error: fail("Body JSON non valido", 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      data: null,
      error: fail("Dati non validi", 422, result.error.flatten()),
    };
  }
  return { data: result.data, error: null };
}

/** Traduce gli errori noti (validazione Mongoose, duplicati, Zod) in risposte HTTP. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Dati non validi", 422, err.flatten());
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return fail("Dati non validi", 422, err.errors);
  }
  if (err instanceof mongoose.Error.CastError) {
    return fail("Identificativo non valido", 400);
  }
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    return fail("Record già esistente (vincolo di unicità)", 409, (err as { keyValue?: unknown }).keyValue);
  }
  console.error("[api] errore non gestito:", err);
  return fail("Errore interno del server", 500);
}
