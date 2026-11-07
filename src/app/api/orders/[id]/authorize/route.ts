import { authorizeOrder, HttpError } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Called after the buyer approved the checkout in the PayPal popup
 * (or simulated popup). Executes POST /v2/checkout/orders/{id}/authorize.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const order = await authorizeOrder(id);
    return Response.json({ order });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Authorize failed.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
