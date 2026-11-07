import { createCheckoutOrder, HttpError, listOrders } from "@/lib/store";
import type { BuyerPrefs } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Merchant dashboard: recent orders. */
export async function GET() {
  try {
    const orders = await listOrders();
    return Response.json({ orders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load orders.", code: "ORDERS_FAILED" },
      { status: 500 },
    );
  }
}

/** Buyer: start checkout. Creates local order + PayPal order (intent=AUTHORIZE). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      productId?: string;
      buyerName?: string;
      buyerEmail?: string;
      prefs?: Partial<BuyerPrefs>;
    };
    if (!body.productId || typeof body.productId !== "string") {
      return Response.json(
        { error: "productId is required.", code: "PRODUCT_REQUIRED" },
        { status: 422 },
      );
    }
    const order = await createCheckoutOrder({
      productId: body.productId,
      buyerName: body.buyerName ?? "",
      buyerEmail: body.buyerEmail ?? "",
      prefs: body.prefs,
    });
    return Response.json({ order }, { status: 201 });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Checkout failed.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
