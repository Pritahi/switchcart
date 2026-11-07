import { HttpError, submitConsent } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Buyer consent decision.
 *   { decision: "accept",  replacementId } -> capture (reauthorize first if pricier)
 *   { decision: "decline" }                -> void the authorization
 *   { decision: "cancel"  }                -> abandon before PayPal approval
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { decision?: unknown; replacementId?: unknown };
    if (
      body.decision !== "accept" &&
      body.decision !== "decline" &&
      body.decision !== "cancel"
    ) {
      return Response.json(
        { error: 'decision must be "accept", "decline" or "cancel".', code: "BAD_DECISION" },
        { status: 422 },
      );
    }
    const order = await submitConsent(id, {
      decision: body.decision,
      replacementId: typeof body.replacementId === "string" ? body.replacementId : undefined,
    });
    return Response.json({ order });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ error: e.message, code: e.code }, { status: e.status });
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Consent handling failed.", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
