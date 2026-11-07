import { getOrderDTO, HttpError } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const order = await getOrderDTO(id);
    return Response.json({ order });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load order.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
