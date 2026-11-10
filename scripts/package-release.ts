import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSourceArchive } from "../src/lib/source-archive";

async function main() {
  const root = process.cwd();
  const { bytes, info } = await buildSourceArchive(root);
  const directory = path.join(root, "public", "downloads");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "switchcart-source.zip"), bytes);
  await writeFile(path.join(directory, "release.json"), JSON.stringify(info, null, 2) + "\n");
  console.log(`Packaged ${info.fileCount} complete source files (${info.sourceBytes} bytes).`);
  console.log(`ZIP: public/downloads/switchcart-source.zip (${info.zipBytes} bytes)`);
  console.log(`SHA-256: ${info.zipSha256}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
