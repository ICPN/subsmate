import { connectToDatabase } from "@/lib/mongodb";
import { Service } from "@/models/Service";
import { serviceCreateSchema } from "@/lib/validation";
import { ok, handleError, parseBody } from "@/lib/api";
import { withAdmin } from "@/lib/requireAdmin";

/** GET /api/services — elenco servizi (Claude, ChatGPT, ...). */
async function handleGET() {
  try {
    await connectToDatabase();
    const services = await Service.find().sort({ name: 1 }).lean();
    return ok(services);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/services — crea un servizio. Lo slug si deriva dal nome se omesso. */
async function handlePOST(request: Request) {
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

export const GET = withAdmin(handleGET);
export const POST = withAdmin(handlePOST);

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
