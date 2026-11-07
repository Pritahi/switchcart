import { HttpError, setProductAvailability } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Merchant toggles a product's availability. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { inStock?: unknown };
    if (typeof body.inStock !== "boolean") {
      return Response.json(
        { error: "Body must include { inStock: boolean }.", code: "BAD_BODY" },
        { status: 422 },
      );
    }
    const result = await setProductAvailability(id, body.inStock);
    return Response.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Availability update failed.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
