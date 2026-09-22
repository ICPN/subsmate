import { connectToDatabase } from "@/lib/mongodb";
import { Service } from "@/models/Service";
import { serviceCreateSchema } from "@/lib/validation";
import { ok, handleError, parseBody } from "@/lib/api";

/** GET /api/services — elenco servizi (Claude, ChatGPT, ...). */
export async function GET() {
  try {
    await connectToDatabase();
    const services = await Service.find().sort({ name: 1 }).lean();
    return ok(services);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/services — crea un servizio. Lo slug si deriva dal nome se omesso. */
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const { data, error } = await parseBody(request, serviceCreateSchema);
    if (error) return error;

    const slug = data.slug ?? slugify(data.name);
    const service = await Service.create({ ...data, slug });
    return ok(service, 201);
  } catch (err) {
    return handleError(err);
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
