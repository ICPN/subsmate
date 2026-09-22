import { connectToDatabase } from "@/lib/mongodb";
import { Person } from "@/models/Person";
import { personCreateSchema } from "@/lib/validation";
import { ok, handleError, parseBody } from "@/lib/api";

/** GET /api/people — elenco persone del team, con ricerca testuale opzionale. */
export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    const filter = q
      ? {
          $or: [
            { firstName: { $regex: q, $options: "i" } },
            { lastName: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const people = await Person.find(filter).sort({ lastName: 1, firstName: 1 }).lean();
    return ok(people);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { data, error } = await parseBody(request, personCreateSchema);
    if (error) return error;

    const person = await Person.create(data);
    return ok(person, 201);
  } catch (err) {
    return handleError(err);
  }
}
