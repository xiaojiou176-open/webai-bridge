import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

const FORBIDDEN_CONTENT_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "aws access key", regex: /AKIA[0-9A-Z]{16}/u },
  { label: "github classic token", regex: /ghp_[A-Za-z0-9]{36}/u },
  { label: "github oauth token", regex: /gho_[A-Za-z0-9]{36}/u },
  { label: "github fine-grained token", regex: /github_pat_[A-Za-z0-9_]{20,}/u },
  { label: "google api key", regex: /AIza[0-9A-Za-z_-]{35}/u },
  { label: "slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/u },
  { label: "generic secret key", regex: /sk-[A-Za-z0-9]{20,}/u },
  { label: "private key block", regex: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/u },
  { label: "host absolute path", regex: /\/Users\/|\/private\/var\/folders\//u },
];

const FORBIDDEN_TRACKED_PATHS = [
  /^\.env$/u,
  /^\.env\.[^/]+$/u,
  /^.*\.log$/u,
  /^\.runtime-cache\//u,
];

function listTrackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\u0000")
    .filter(Boolean);
}

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function isAllowedTrackedPath(file: string) {
  return file === ".env.example";
}

describe("WebaiBridge sensitive surface hygiene", () => {
  it("keeps the tracked sensitive-material gate itself green", () => {
    const output = execFileSync("node", ["scripts/check-sensitive-material.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(output).toContain("No tracked sensitive material findings.");
  });

  it("keeps tracked files free of forbidden tracked secret/log/runtime paths", () => {
    const trackedFiles = listTrackedFiles();
    const violations = trackedFiles.filter((file) =>
      FORBIDDEN_TRACKED_PATHS.some((pattern) => pattern.test(file)) && !isAllowedTrackedPath(file),
    );

    expect(violations).toEqual([]);
  });

  it("keeps maintainer-only shelves out of the current git history", () => {
    const historyListing = execFileSync(
      "git",
      ["log", "--all", "--name-only", "--pretty=format:"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    expect(historyListing).not.toMatch(/^\.agents\//mu);
    expect(historyListing).not.toMatch(/^docs\/adr\//mu);
    expect(historyListing).not.toMatch(/^docs\/contracts\//mu);
    expect(historyListing).not.toMatch(/^docs\/product\//mu);
    expect(historyListing).not.toMatch(/^docs\/blueprints\//mu);
    expect(historyListing).not.toMatch(/^docs\/compare\//mu);
  });

  it("keeps tracked text content free of real secret formats and host absolute paths", () => {
    const trackedFiles = listTrackedFiles().filter(
      (file) =>
        existsSync(resolve(repoRoot, file)) &&
        !file.endsWith(".png") &&
        !file.endsWith(".jpg") &&
        !file.endsWith(".jpeg") &&
        !file.endsWith(".gif") &&
        !file.endsWith(".ico") &&
        !file.endsWith(".pdf"),
    );

    const violations: Array<{ file: string; label: string }> = [];

    for (const file of trackedFiles) {
      const content = read(file);
      for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push({ file, label: pattern.label });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
