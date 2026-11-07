import { listProducts } from "@/lib/store";
import { HttpError } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await listProducts();
    return Response.json({ products });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load products.", code: "PRODUCTS_FAILED" },
      { status },
    );
  }
}
