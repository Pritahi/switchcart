import { HttpError, requestSubstitution } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Generates (or returns the existing) AI substitution proposal for an order. */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const order = await requestSubstitution(id);
    return Response.json({ order });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Substitution failed.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
