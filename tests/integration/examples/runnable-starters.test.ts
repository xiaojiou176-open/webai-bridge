import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

async function runExample(relativePath: string, env: NodeJS.ProcessEnv) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [resolve(repoRoot, relativePath)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
    },
  );

  return JSON.parse(stdout);
}

describe("runnable starter mini-projects", () => {
  it("runs the thin runtime bridge starter against a mock runtime", async () => {
    let receivedBody: Record<string, unknown> | undefined;
    const service = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/v1/runtime/invoke") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", () => {
          receivedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              ok: true,
              output: [{ type: "text", text: "starter-ok" }],
            }),
          );
        });
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not-found" }));
    });

    service.listen(0, "127.0.0.1");
    await once(service, "listening");

    const address = service.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the runtime bridge starter test server to expose a TCP port.");
    }

    try {
      const output = await runExample("examples/runtime-bridge/invoke.mjs", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
      });

      expect(output).toEqual(
        expect.objectContaining({
          starter: "thin-runtime-bridge",
          request: expect.objectContaining({
            provider: "openai",
            lane: "byok",
          }),
          response: expect.objectContaining({
            ok: true,
          }),
        }),
      );
      expect(receivedBody).toEqual(output.request);
    } finally {
      await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
    }
  });

  it("runs the diagnostics starter against mock provider status routes", async () => {
    const service = createServer((request, response) => {
      response.setHeader("content-type", "application/json");

      if (request.url === "/v1/runtime/providers/chatgpt/status") {
        response.end(
          JSON.stringify({
            provider: {
              providerId: "chatgpt",
              runtimeReadiness: "ready",
            },
          }),
        );
        return;
      }

      if (request.url === "/v1/runtime/providers/chatgpt/probe") {
        response.end(
          JSON.stringify({
            probe: {
              status: "ok",
            },
          }),
        );
        return;
      }

      if (request.url === "/v1/runtime/providers/chatgpt/remediation") {
        response.end(
          JSON.stringify({
            remediation: {
              status: "none",
              suggestedAction: "none",
            },
          }),
        );
        return;
      }

      if (request.url === "/v1/runtime/providers/chatgpt/debug/support-bundle") {
        response.end(
          JSON.stringify({
            debug: {
              attachTarget: { available: true },
              storeReadiness: { runtimeReadiness: "ready" },
              liveReadiness: { status: "live-ready" },
              diagnoseLadder: [{ id: "status", status: "completed" }],
            },
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not-found" }));
    });

    service.listen(0, "127.0.0.1");
    await once(service, "listening");

    const address = service.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the diagnostics starter test server to expose a TCP port.");
    }

    try {
      const output = await runExample("examples/runtime-diagnostics/check.mjs", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
      });

      expect(output).toEqual(
        expect.objectContaining({
          starter: "read-only-runtime-diagnostics",
          provider: "chatgpt",
          status: expect.objectContaining({
            providerId: "chatgpt",
          }),
          probe: expect.objectContaining({
            status: "ok",
          }),
          supportBundleSummary: expect.objectContaining({
            diagnoseLadderLength: 1,
          }),
        }),
      );
    } finally {
      await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
    }
  });

  it(
    "runs the read-only MCP inspector starter against a mock runtime",
    async () => {
      const requests: string[] = [];
      const service = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.setHeader("content-type", "application/json");

        if (request.url === "/v1/runtime/health") {
          response.end(
            JSON.stringify({
              lane: "web",
              totals: {
                total: 5,
                ready: 5,
              },
            }),
          );
          return;
        }

        response.statusCode = 404;
        response.end(JSON.stringify({ error: "not-found" }));
      });

      service.listen(0, "127.0.0.1");
      await once(service, "listening");

      const address = service.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected the MCP inspector starter test server to expose a TCP port.");
      }

      try {
        const output = await runExample("examples/mcp-inspector/smoke.mjs", {
          WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
        });

        expect(output.starter).toBe("read-only-mcp-inspector");
        expect(output.availableTools).toEqual(
          expect.arrayContaining([
            "webai-bridge.runtime.health",
            "webai-bridge.catalog.mcp_tools",
          ]),
        );
        expect(output.runtimeHealth).toEqual(
          expect.objectContaining({
            command: "health",
            readOnly: true,
            result: expect.objectContaining({
              lane: "web",
              totals: expect.objectContaining({
                ready: 5,
              }),
            }),
          }),
        );
        expect(output.catalogTools).toEqual(
          expect.objectContaining({}),
        );
        expect(requests).toContain("GET /v1/runtime/health");
      } finally {
        await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
      }
    },
    150_000,
  );

  it("runs the host runnable glue examples against a mock invoke runtime", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const service = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/v1/runtime/invoke") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", () => {
          requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ ok: true, output: [{ type: "text", text: "host-ok" }] }));
        });
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not-found" }));
    });

    service.listen(0, "127.0.0.1");
    await once(service, "listening");

    const address = service.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the host example test server to expose a TCP port.");
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const codex = await runExample("examples/hosts/codex/smoke.mjs", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: baseUrl,
      });
      const claudeCode = await runExample("examples/hosts/claude-code/smoke.mjs", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: baseUrl,
      });
      const openclaw = await runExample("examples/hosts/openclaw/smoke.mjs", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: baseUrl,
      });

      expect(codex).toEqual(
        expect.objectContaining({
          starter: "host-example-codex",
          target: "codex",
          response: expect.objectContaining({ ok: true }),
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target codex",
        }),
      );
      expect(claudeCode).toEqual(
        expect.objectContaining({
          starter: "host-example-claude-code",
          target: "claude-code",
          response: expect.objectContaining({ ok: true }),
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target claude-code",
        }),
      );
      expect(openclaw).toEqual(
        expect.objectContaining({
          starter: "host-example-openclaw",
          target: "openclaw",
          response: expect.objectContaining({ ok: true }),
          bestEntry: "pnpm run webai-bridge:cli -- host-example --target openclaw",
        }),
      );

      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: "chatgpt", lane: "web" }),
          expect.objectContaining({ provider: "claude", lane: "web" }),
          expect.objectContaining({ provider: "chatgpt", lane: "web" }),
        ]),
      );
    } finally {
      await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
    }
  });

  it(
    "runs the MCP host runnable glue example against a mock runtime",
    async () => {
      const requests: string[] = [];
      const service = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.setHeader("content-type", "application/json");

        if (request.url === "/v1/runtime/health") {
          response.end(JSON.stringify({ totals: { ready: 5 } }));
          return;
        }

        response.statusCode = 404;
        response.end(JSON.stringify({ error: "not-found" }));
      });

      service.listen(0, "127.0.0.1");
      await once(service, "listening");

      const address = service.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected the MCP host example test server to expose a TCP port.");
      }

      try {
        const output = await runExample("examples/hosts/mcp/smoke.mjs", {
          WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
        });

        expect(output.starter).toBe("host-example-mcp");
        expect(output.target).toBe("mcp");
        expect(output.availableTools).toEqual(
          expect.arrayContaining([
            "webai-bridge.runtime.health",
            "webai-bridge.catalog.host_examples",
          ]),
        );
        expect(output.toolResult).toEqual(
          expect.objectContaining({
            command: "health",
          }),
        );
        expect(output.bestEntry).toBe(
          "pnpm run webai-bridge:cli -- host-example --target mcp",
        );
        expect(requests).toContain("GET /v1/runtime/health");
      } finally {
        await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
      }
    },
    150_000,
  );
});
