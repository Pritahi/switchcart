import { HttpError, listAudit } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Audit trail. GET /api/audit or GET /api/audit?orderId=<uuid> */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId") || undefined;
    const limitRaw = Number(url.searchParams.get("limit") || "200");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
    const events = await listAudit(orderId, limit);
    return Response.json({ events });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load audit trail.", code: "AUDIT_FAILED" },
      { status },
    );
  }
}
