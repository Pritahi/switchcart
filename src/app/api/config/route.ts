import { AI_CONFIGURED } from "@/lib/ai";
import { PAYPAL_MODE } from "@/lib/paypal";
import { SEED_MERCHANT } from "@/data/catalog";
import type { ConfigDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Public runtime config for the storefront.
 * The PayPal *client id* is designed to be public (it is embedded in the
 * PayPal JS SDK script tag); the secret never leaves the server.
 */
export async function GET() {
  const body: ConfigDTO = {
    paypalClientId: PAYPAL_MODE === "sandbox" ? process.env.PAYPAL_CLIENT_ID ?? null : null,
    mode: PAYPAL_MODE,
    merchantName: SEED_MERCHANT.name,
    aiConfigured: AI_CONFIGURED,
    aiModel: AI_CONFIGURED ? process.env.AI_MODEL || "gpt-4o-mini" : "switchcart-rules-v1",
  };
  return Response.json(body);
}
