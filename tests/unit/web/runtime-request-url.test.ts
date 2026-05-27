import { describe, expect, it } from "vitest";

import {
  buildRuntimeRequestUrl,
  encodeRuntimePathSegment,
  formatRuntimeHelpUrl,
  normalizeRuntimeBaseUrl,
  resolveRuntimeBaseUrlFromEnv,
} from "../../../scripts/runtime-request-url.mjs";

describe("runtime request URL helpers", () => {
  it("accepts loopback runtime base URLs and normalized runtime paths", () => {
    expect(normalizeRuntimeBaseUrl("http://127.0.0.1:4010").toString()).toBe(
      "http://127.0.0.1:4010/",
    );
    expect(
      buildRuntimeRequestUrl(
        "http://127.0.0.1:4010",
        `/v1/runtime/providers/${encodeRuntimePathSegment("chatgpt")}/status`,
      ),
    ).toBe("http://127.0.0.1:4010/v1/runtime/providers/chatgpt/status");
  });

  it("rejects public runtime hosts and credential-bearing base URLs", () => {
    const credentialBearingLoopbackUrl = new URL("http://127.0.0.1:4010");
    credentialBearingLoopbackUrl.username = "user";
    credentialBearingLoopbackUrl.password = "pass";

    expect(() => normalizeRuntimeBaseUrl("https://example.com")).toThrow(
      /loopback, private-network, or local-development host/u,
    );
    expect(() => normalizeRuntimeBaseUrl(credentialBearingLoopbackUrl.toString())).toThrow(
      /must not include credentials/u,
    );
  });

  it("accepts private-network, loopback IPv6, and single-label local development hosts", () => {
    expect(normalizeRuntimeBaseUrl("http://10.0.0.5:4010").toString()).toBe(
      "http://10.0.0.5:4010/",
    );
    expect(normalizeRuntimeBaseUrl("http://172.16.5.9:4010").toString()).toBe(
      "http://172.16.5.9:4010/",
    );
    expect(normalizeRuntimeBaseUrl("http://192.168.1.8:4010").toString()).toBe(
      "http://192.168.1.8:4010/",
    );
    expect(normalizeRuntimeBaseUrl("http://[::1]:4010").toString()).toBe(
      "http://[::1]:4010/",
    );
    expect(normalizeRuntimeBaseUrl("http://[fd00::1]:4010").toString()).toBe(
      "http://[fd00::1]:4010/",
    );
    expect(normalizeRuntimeBaseUrl("http://webai-bridge-dev:4010").toString()).toBe(
      "http://webai-bridge-dev:4010/",
    );
  });

  it("rejects unsafe runtime path traversal and host-style paths", () => {
    expect(() => buildRuntimeRequestUrl("http://127.0.0.1:4010", "//evil.example/path")).toThrow(
      /must stay on the local runtime origin/u,
    );
    expect(() => buildRuntimeRequestUrl("http://127.0.0.1:4010", "/v1/runtime/../secrets")).toThrow(
      /must not contain path traversal segments/u,
    );
    expect(() => buildRuntimeRequestUrl("http://127.0.0.1:4010", "/v1/runtime/providers/chatgpt?debug=1")).toThrow(
      /must not include backslashes, query parameters, or fragments/u,
    );
    expect(() => buildRuntimeRequestUrl("http://127.0.0.1:4010", "/v1\\runtime\\providers\\chatgpt")).toThrow(
      /must not include backslashes, query parameters, or fragments/u,
    );
  });

  it("rejects unsafe runtime path segments before interpolation", () => {
    expect(() => encodeRuntimePathSegment("../chatgpt")).toThrow(/must only use letters, numbers/u);
    expect(() => encodeRuntimePathSegment("chatgpt/status")).toThrow(/must only use letters, numbers/u);
  });

  it("derives runtime base URLs from env and formats help URLs safely", () => {
    expect(
      resolveRuntimeBaseUrlFromEnv({
        WEBAI_BRIDGE_RUNTIME_BASE_URL: "http://127.0.0.1:4317",
      }),
    ).toBe("http://127.0.0.1:4317");
    expect(
      resolveRuntimeBaseUrlFromEnv({
        WEBAI_BRIDGE_SERVICE_PORT: "4017",
      }),
    ).toBe("http://127.0.0.1:4017");
    expect(
      formatRuntimeHelpUrl(
        "http://127.0.0.1:4010",
        "/v1/runtime/health",
      ),
    ).toBe("http://127.0.0.1:4010/v1/runtime/health");
    expect(
      formatRuntimeHelpUrl(
        "http://127.0.0.1:4010",
        "//evil.example/path",
      ),
    ).toBe("http://127.0.0.1:4010//evil.example/path");
    expect(resolveRuntimeBaseUrlFromEnv({})).toBe("http://127.0.0.1:4010");
    expect(
      formatRuntimeHelpUrl(
        "not-a-valid-url",
        "/v1/runtime/health",
      ),
    ).toBe("not-a-valid-url/v1/runtime/health");
  });
});
