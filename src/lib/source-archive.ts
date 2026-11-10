import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { zipSync, type Zippable } from "fflate";

/**
 * Explicit source allowlist. Never include .env, runtime databases,
 * dependencies, build output, Git credentials or generated ZIP recursively.
 * Every included file is complete and stored under switchcart/<project-path>.
 */
const ROOT_FILES = new Set([
  ".env.example", ".gitignore", "LICENSE", "README.md", "SUBMISSION.md",
  "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json", "render.yaml",
  "compose.yaml", "drizzle.config.ts", "next.config.ts", "tsconfig.json",
  "next-env.d.ts", "eslint.config.mjs", "postcss.config.mjs",
]);
const ROOT_DIRS = new Set([
  ".github", "src", "server", "scripts", "tests", "docs", "public", "drizzle",
]);
const MAX_FILES = 1_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

export interface ReleaseInfo {
  fileCount: number;
  sourceBytes: number;
  zipBytes: number;
  zipSha256: string;
  manifestSha256: string;
}

async function collect(root: string, relative: string, out: string[]): Promise<void> {
  const absolute = path.join(root, relative);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symlink excluded from source archive: ${relative}`);
  if (stat.isDirectory()) {
    if (relative.replaceAll("\\", "/") === "public/downloads") return;
    const entries = await readdir(/* turbopackIgnore: true */ absolute);
    for (const name of entries.sort()) {
      if (name === ".env" || name.startsWith(".env.") && name !== ".env.example") continue;
      if (name === ".DS_Store" || name.endsWith(".tsbuildinfo")) continue;
      await collect(root, path.join(relative, name), out);
    }
  } else if (stat.isFile()) {
    if (stat.size > MAX_FILE_BYTES) throw new Error(`Source file is too large: ${relative}`);
    out.push(relative.replaceAll("\\", "/"));
  }
}

export async function collectSourceFiles(root = process.cwd()): Promise<string[]> {
  const entries = await readdir(/* turbopackIgnore: true */ root);
  const files: string[] = [];
  for (const entry of entries.sort()) {
    if (ROOT_FILES.has(entry) || ROOT_DIRS.has(entry)) await collect(root, entry, files);
  }
  if (!files.includes("package.json") || !files.includes("src/app/page.tsx")) {
    throw new Error("Run source packaging from the complete SwitchCart project root.");
  }
  if (files.length > MAX_FILES) throw new Error("Too many source files for a release archive.");
  return files.sort();
}

export async function buildSourceArchive(root = process.cwd()): Promise<{ bytes: Uint8Array; info: ReleaseInfo }> {
  const files = await collectSourceFiles(root);
  const archive: Zippable = {};
  const manifest: Array<{ path: string; bytes: number; sha256: string }> = [];
  let sourceBytes = 0;
  for (const relative of files) {
    const bytes = new Uint8Array(await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root, relative)));
    sourceBytes += bytes.byteLength;
    if (sourceBytes > MAX_TOTAL_BYTES) throw new Error("Source archive exceeds the 40 MB safety limit.");
    archive[`switchcart/${relative}`] = [bytes, { mtime: new Date("2026-11-01T00:00:00Z") }];
    manifest.push({ path: relative, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const manifestBytes = new TextEncoder().encode(JSON.stringify({
    project: "SwitchCart",
    formatVersion: 1,
    exclusions: [".env and private env files", "node_modules", ".next", ".git", "generated download artifacts"],
    files: manifest,
  }, null, 2) + "\n");
  archive["switchcart/SOURCE_MANIFEST.json"] = [manifestBytes, { mtime: new Date("2026-11-01T00:00:00Z") }];
  const bytes = zipSync(archive, { level: 6 });
  return {
    bytes,
    info: {
      fileCount: files.length,
      sourceBytes,
      zipBytes: bytes.byteLength,
      zipSha256: createHash("sha256").update(bytes).digest("hex"),
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    },
  };
}
