import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { buildSourceArchive, collectSourceFiles } from "../src/lib/source-archive";

test("archive contains complete allowlisted files, a manifest, and no secrets or recursive ZIP", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "switchcart-release-"));
  try {
    await mkdir(path.join(root, "src/app"), { recursive: true });
    await mkdir(path.join(root, "public/downloads"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"name":"switchcart-test"}');
    await writeFile(path.join(root, "src/app/page.tsx"), "export default function Page() { return null; }\n");
    await writeFile(path.join(root, ".env"), "DATABASE_URL=private-secret");
    await writeFile(path.join(root, "public/downloads/switchcart-source.zip"), "old archive");
    const { bytes, info } = await buildSourceArchive(root);
    const entries = unzipSync(bytes);
    assert.equal(info.fileCount, 2);
    assert.ok(entries["switchcart/package.json"]);
    assert.ok(entries["switchcart/src/app/page.tsx"]);
    assert.ok(entries["switchcart/SOURCE_MANIFEST.json"]);
    assert.equal(new TextDecoder().decode(entries["switchcart/src/app/page.tsx"]), "export default function Page() { return null; }\n");
    assert.ok(!Object.keys(entries).some((name) => name.includes(".env") && !name.endsWith(".env.example")));
    assert.ok(!Object.keys(entries).some((name) => name.endsWith(".zip")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlinks cannot exfiltrate files outside the project", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "switchcart-symlink-"));
  try {
    await mkdir(path.join(root, "src"));
    await symlink("/etc/hosts", path.join(root, "src/leak"));
    await assert.rejects(collectSourceFiles(root), /Symlink excluded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
