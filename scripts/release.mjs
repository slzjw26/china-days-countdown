import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function releaseVersion(tag) {
  // Restrict tags before passing them to Git or using them in output paths.
  if (typeof tag !== "string" || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || tag.includes("\n")) {
    throw new Error("标签必须采用 vX.Y.Z 格式，例如 v0.1.0");
  }
  return tag.slice(1);
}

export function validateRelease(tag, manifest, lock, changelog) {
  const version = releaseVersion(tag);
  if (manifest.name !== "china-days-countdown" || manifest.version !== version) {
    throw new Error("标签与 package.json 项目名称或版本不匹配");
  }
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    throw new Error("package-lock.json 的两个版本字段必须与标签一致");
  }
  const heading = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m");
  const match = heading.exec(changelog);
  if (!match) throw new Error(`CHANGELOG.md 缺少 ${version} 的发布条目与日期`);
  const section = changelog
    .slice(match.index + match[0].length)
    .split(/^## /m)[0]
    .trim();
  if (!section) throw new Error("CHANGELOG.md 的发布说明不能为空");
  return { version, notes: `${section}\n` };
}

function readRelease(read, tag) {
  return validateRelease(
    tag,
    JSON.parse(read("package.json")),
    JSON.parse(read("package-lock.json")),
    read("CHANGELOG.md"),
  );
}

export function packageRelease(cwd, tag) {
  releaseVersion(tag);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = git("rev-parse", "--verify", `${tag}^{commit}`);
  if (commit !== git("rev-parse", "HEAD")) throw new Error("当前 HEAD 与发布标签不是同一提交");

  // Read both metadata and archive contents from the same immutable Git commit.
  const release = readRelease((path) => git("show", `${commit}:${path}`), tag);
  const directory = resolve(cwd, ".release");
  mkdirSync(directory, { recursive: true });
  const archive = join(directory, `china-days-countdown-${release.version}-source.zip`);
  git("archive", "--format=zip", `--prefix=china-days-countdown-${release.version}/`, `--output=${archive}`, commit);
  const checksum = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const checksums = join(directory, "SHA256SUMS");
  const notes = join(directory, "notes.md");
  writeFileSync(checksums, `${checksum}  ${basename(archive)}\n`);
  writeFileSync(notes, release.notes);
  return { archive, checksums, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [, , command, tag] = process.argv;
    if (command === "check") {
      const result = readRelease((path) => readFileSync(path, "utf8"), tag);
      console.log(`版本与发布说明校验通过：v${result.version}`);
    } else if (command === "package") {
      console.log(JSON.stringify(packageRelease(process.cwd(), tag), null, 2));
    } else {
      throw new Error("用法：node scripts/release.mjs <check|package> vX.Y.Z");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
