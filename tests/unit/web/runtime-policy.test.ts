import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertPathInsideAllowedRoots,
  assertSafePathSegment,
  resolveCredentialedBrowserMode,
  resolveExternalCacheRoot,
  resolveIsolatedChromeProfileDisplayName,
  resolveCacheMaxBytes,
  resolveCacheTtlDays,
  resolveIsolatedChromeUserDataDir,
  resolveSourceChromeProfileSelection,
} from "../../../scripts/runtime-policy.mjs";

describe("runtime policy path guards", () => {
  it("rejects isolated chrome roots outside allowed artifact roots", () => {
    expect(() =>
      resolveIsolatedChromeUserDataDir({
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: "/etc/webai-bridge-profile",
      }),
    ).toThrow(/must stay inside one of/u);
  });

  it("rejects source chrome roots outside trusted browser filesystem roots", () => {
    expect(() =>
      resolveSourceChromeProfileSelection({
        WEBAI_BRIDGE_SOURCE_CHROME_USER_DATA_DIR: "/etc/webai-bridge-source-profile",
      }),
    ).toThrow(/must stay inside one of/u);
  });

  it("accepts isolated browser roots under the system temp directory", () => {
    const candidate = join(tmpdir(), "webai-bridge-tests", "isolated-browser-root");

    expect(
      resolveIsolatedChromeUserDataDir({
        WEBAI_BRIDGE_CHROME_USER_DATA_DIR: candidate,
      }),
    ).toBe(resolve(candidate));
  });

  it("rejects profile directory values that are not single path segments", () => {
    expect(() => assertSafePathSegment("../Profile 1", "profile directory")).toThrow(
      /single path segment/u,
    );
    expect(assertSafePathSegment(" Profile 1 ", "profile directory")).toBe("Profile 1");
  });

  it("uses the documented default cache policy when no override is provided", () => {
    expect(resolveCacheTtlDays({})).toBe(7);
    expect(resolveCacheMaxBytes({})).toBe(8 * 1024 * 1024 * 1024);
  });

  it("accepts positive integer cache policy overrides from env", () => {
    expect(
      resolveCacheTtlDays({
        WEBAI_BRIDGE_CACHE_TTL_DAYS: "14",
      }),
    ).toBe(14);
    expect(
      resolveCacheMaxBytes({
        WEBAI_BRIDGE_CACHE_MAX_BYTES: `${9 * 1024 * 1024 * 1024}`,
      }),
    ).toBe(9 * 1024 * 1024 * 1024);
  });

  it("falls back to defaults when cache policy overrides are empty, invalid, or non-positive", () => {
    expect(
      resolveCacheTtlDays({
        WEBAI_BRIDGE_CACHE_TTL_DAYS: "0",
      }),
    ).toBe(7);
    expect(
      resolveCacheTtlDays({
        WEBAI_BRIDGE_CACHE_TTL_DAYS: "not-a-number",
      }),
    ).toBe(7);
    expect(
      resolveCacheMaxBytes({
        WEBAI_BRIDGE_CACHE_MAX_BYTES: "-1",
      }),
    ).toBe(8 * 1024 * 1024 * 1024);
    expect(
      resolveCacheMaxBytes({
        WEBAI_BRIDGE_CACHE_MAX_BYTES: "",
      }),
    ).toBe(8 * 1024 * 1024 * 1024);
  });

  it("expands a tilde-based external cache root outside the repo worktree", () => {
    const repoRoot = "/tmp/webai-bridge-repo";
    const resolved = resolveExternalCacheRoot(
      {
        WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT: "~/.cache/webai-bridge-tests",
      },
      repoRoot,
    );

    expect(resolved.endsWith("/.cache/webai-bridge-tests")).toBe(true);
  });

  it("rejects external cache roots that point back inside the repo", () => {
    const repoRoot = "/tmp/webai-bridge-repo";

    expect(() =>
      resolveExternalCacheRoot(
        {
          WEBAI_BRIDGE_EXTERNAL_CACHE_ROOT: `${repoRoot}/.runtime-cache/external`,
        },
        repoRoot,
      ),
    ).toThrow(/must live outside the repo worktree/u);
  });

  it("accepts child paths inside allowed roots and rejects outsiders", () => {
    expect(
      assertPathInsideAllowedRoots(
        "/tmp/webai-bridge-safe/cache/profile",
        ["/tmp/webai-bridge-safe", "/tmp/other-root"],
        "browser root",
      ),
    ).toBe("/tmp/webai-bridge-safe/cache/profile");

    expect(() =>
      assertPathInsideAllowedRoots(
        "/etc/webai-bridge-profile",
        ["/tmp/webai-bridge-safe"],
        "browser root",
      ),
    ).toThrow(/must stay inside one of/u);
  });

  it("defaults browser mode by environment and honors explicit overrides", () => {
    expect(resolveCredentialedBrowserMode({})).toBe("isolated-chrome-root");
    expect(resolveCredentialedBrowserMode({ CI: "true" })).toBe("managed-browser");
    expect(
      resolveCredentialedBrowserMode({
        WEBAI_BRIDGE_BROWSER_MODE: "existing-browser-session",
      }),
    ).toBe("existing-browser-session");
    expect(
      resolveCredentialedBrowserMode({
        WEBAI_BRIDGE_BROWSER_MODE: "existing-chrome-profile",
      }),
    ).toBe("isolated-chrome-root");
    expect(
      resolveCredentialedBrowserMode({
        WEBAI_BRIDGE_BROWSER_MODE: "not-a-real-mode",
      }),
    ).toBe("isolated-chrome-root");
  });

  it("uses the documented default isolated profile display name unless overridden", () => {
    expect(resolveIsolatedChromeProfileDisplayName({})).toBe("webai-bridge");
    expect(
      resolveIsolatedChromeProfileDisplayName({
        WEBAI_BRIDGE_CHROME_PROFILE_NAME: "WebaiBridge QA",
      }),
    ).toBe("WebaiBridge QA");
  });
});
