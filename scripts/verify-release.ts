import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { collectSourceFiles, type ReleaseInfo } from "../src/lib/source-archive";

async function main() {
  const root = process.cwd();
  const bytes = new Uint8Array(await readFile(path.join(root, "public/downloads/switchcart-source.zip")));
  const info = JSON.parse(await readFile(path.join(root, "public/downloads/release.json"), "utf8")) as ReleaseInfo;
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== info.zipSha256 || bytes.byteLength !== info.zipBytes) throw new Error("ZIP checksum/size mismatch.");
  const entries = unzipSync(bytes);
  const names = Object.keys(entries);
  for (const name of names) {
    if (!name.startsWith("switchcart/") || name.includes("..") || name.includes("\\")) throw new Error(`Unsafe ZIP path: ${name}`);
    const relative = name.slice("switchcart/".length);
    if (relative === ".env" || relative.startsWith(".git/") || relative.startsWith("node_modules/") || relative.startsWith(".next/") || relative.endsWith(".zip")) {
      throw new Error(`Forbidden release entry: ${name}`);
    }
  }
  const manifest = JSON.parse(new TextDecoder().decode(entries["switchcart/SOURCE_MANIFEST.json"])) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  const current = await collectSourceFiles(root);
  const listed = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(current) !== JSON.stringify(listed)) throw new Error("Archive is stale or incomplete. Regenerate with scripts/package-release.ts.");
  for (const file of manifest.files) {
    const content = entries[`switchcart/${file.path}`];
    if (!content || content.byteLength !== file.bytes || createHash("sha256").update(content).digest("hex") !== file.sha256) {
      throw new Error(`Missing or changed full file: ${file.path}`);
    }
  }
  if (manifest.files.length !== info.fileCount) throw new Error("File count mismatch.");
  console.log(`Verified ${manifest.files.length} complete project files + SOURCE_MANIFEST.json.`);
  console.log(`No private environment files, dependencies, build caches or recursive ZIPs.`);
  console.log(`SHA-256 verified: ${hash}`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
