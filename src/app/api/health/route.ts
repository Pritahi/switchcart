import { db } from "@/db";
import { sql } from "drizzle-orm";
import { PAYPAL_MODE } from "@/lib/paypal";
import { AI_CONFIGURED } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      service: "switchcart",
      paypalMode: PAYPAL_MODE,
      aiConfigured: AI_CONFIGURED,
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json({ ok: false, service: "switchcart" }, { status: 500 });
  }
}
