import { buildSourceArchive } from "@/lib/source-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fresh, allowlisted source download. Never serves .env or dependencies. */
export async function GET() {
  try {
    const { bytes, info } = await buildSourceArchive();
    const body = new Uint8Array(bytes).buffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="switchcart-source.zip"',
        "Content-Length": String(info.zipBytes),
        "X-Source-File-Count": String(info.fileCount),
        "X-Source-SHA256": info.zipSha256,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Source packaging failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Source archive could not be generated.", code: "SOURCE_PACKAGE_FAILED" }, { status: 500 });
  }
}
