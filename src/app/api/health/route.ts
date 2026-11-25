import { db } from "@/lib/hub/db";

export const dynamic = "force-dynamic";

/**
 * Says whether the Hub can reach its database. Open to anyone, and it tells
 * nothing about what the Hub holds: it exists so an uptime monitor can watch it.
 */
export async function GET() {
  try {
    await db().query("SELECT 1");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ at: "health", ok: false, message: String(error) }));
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
