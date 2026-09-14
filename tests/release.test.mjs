import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { packageRelease, validateRelease } from "../scripts/release.mjs";

const manifest = { name: "china-days-countdown", version: "0.1.0" };
const lock = { version: "0.1.0", packages: { "": { version: "0.1.0" } } };
const changelog =
  "# 更新记录\n\n## [Unreleased]\n\n## [0.1.0] - 2026-09-14\n\n首个公开版本。\n\n## [0.0.1] - 2026-09-01\n\n旧内容\n";

test("release validates tag, both lock versions and the matching changelog section", () => {
  assert.deepEqual(validateRelease("v0.1.0", manifest, lock, changelog), {
    version: "0.1.0",
    notes: "首个公开版本。\n",
  });
  for (const tag of ["0.1.0", "v01.1.0", "v0.1.0;echo", "v0.1.0-beta.1", "v0.1.0\n"]) {
    assert.throws(() => validateRelease(tag, manifest, lock, changelog), /标签/);
  }
  assert.throws(() => validateRelease("v0.2.0", manifest, lock, changelog), /版本/);
  assert.throws(() => validateRelease("v0.1.0", manifest, { ...lock, version: "1.0.0" }, changelog), /lock/);
  assert.throws(
    () => validateRelease("v0.1.0", manifest, { ...lock, packages: { "": { version: "1.0.0" } } }, changelog),
    /lock/,
  );
  assert.throws(() => validateRelease("v0.1.0", manifest, lock, "## [Unreleased]\n待发布"), /CHANGELOG/);
  assert.throws(() => validateRelease("v0.1.0", manifest, lock, "## [0.1.0] - 2026-09-14\n\n"), /CHANGELOG/);
});

test("release archive comes from the tagged commit, has a valid checksum and rejects a different HEAD", () => {
  const cwd = mkdtempSync(join(tmpdir(), "countdown-release-test-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Release Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(cwd, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(cwd, "package-lock.json"), JSON.stringify(lock));
    writeFileSync(join(cwd, "CHANGELOG.md"), changelog);
    writeFileSync(join(cwd, "README.md"), "committed source");
    git("add", "package.json", "package-lock.json", "CHANGELOG.md", "README.md");
    git("commit", "-m", "fixture");
    git("tag", "v0.1.0");
    writeFileSync(join(cwd, "README.md"), "uncommitted source");
    writeFileSync(join(cwd, ".env"), "DO_NOT_PACKAGE=test-fixture");
    const result = packageRelease(cwd, "v0.1.0");
    const bytes = readFileSync(result.archive);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    assert.equal(readFileSync(result.checksums, "utf8"), `${checksum}  china-days-countdown-0.1.0-source.zip\n`);
    assert.equal(readFileSync(result.notes, "utf8"), "首个公开版本。\n");
    const entries = execFileSync("unzip", ["-Z1", result.archive]).toString().trim().split("\n");
    assert(entries.includes("china-days-countdown-0.1.0/README.md"));
    assert(!entries.some((entry) => entry.endsWith(".env") || entry.includes(".release/")));
    assert.equal(
      execFileSync("unzip", ["-p", result.archive, "china-days-countdown-0.1.0/README.md"]).toString(),
      "committed source",
    );
    git("add", "README.md");
    git("commit", "-m", "next commit");
    assert.throws(() => packageRelease(cwd, "v0.1.0"), /HEAD/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
