import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

type CommandFailure = Error & {
  code?: number | string | null;
  stdout?: string;
  stderr?: string;
};

const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};

const exampleScriptMap: Record<string, string> = {
  "example:runtime-bridge": "pnpm exec node examples/runtime-bridge/invoke.mjs",
  "example:mcp-inspector": "pnpm exec node examples/mcp-inspector/smoke.mjs",
};

async function runExampleCommand(commandName: string, env: NodeJS.ProcessEnv) {
  const expectedScript = exampleScriptMap[commandName];
  if (!expectedScript) {
    throw new Error(`No expected script mapping recorded for ${commandName}.`);
  }

  expect(packageJson.scripts?.[commandName]).toBe(expectedScript);

  const scriptPath = expectedScript.replace("pnpm exec node ", "");
  return execFileAsync(process.execPath, [resolve(repoRoot, scriptPath)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: 1024 * 1024,
  });
}

async function expectCommandFailure(commandName: string, env: NodeJS.ProcessEnv) {
  try {
    await runExampleCommand(commandName, env);
  } catch (error) {
    return error as CommandFailure;
  }

  throw new Error(`Expected pnpm run ${commandName} to fail.`);
}

function parseJsonFromCommandStdout(stdout: string) {
  const jsonStart = stdout.indexOf("{");

  if (jsonStart < 0) {
    throw new Error(`Expected command stdout to include JSON, received:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(jsonStart));
}

async function reserveClosedPort() {
  const service = createServer();
  service.listen(0, "127.0.0.1");
  await once(service, "listening");

  const address = service.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
    throw new Error("Expected to reserve a TCP port for the unreachable runtime test.");
  }

  const { port } = address;
  await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
  return port;
}

describe("example package-script entrypoints", () => {
  it("guards the example:runtime-bridge alias against a mock runtime", async () => {
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
              output: [{ type: "text", text: "alias-ok" }],
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
      throw new Error("Expected the runtime bridge command test server to expose a TCP port.");
    }

    try {
      const { stdout } = await runExampleCommand("example:runtime-bridge", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
      });
      const output = parseJsonFromCommandStdout(stdout) as {
        starter: string;
        request: Record<string, unknown>;
        response: { ok: boolean };
      };

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

  it(
    "guards the example:mcp-inspector alias against a mock runtime",
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

        if (request.url === "/v1/runtime/providers/chatgpt/doctor") {
          response.end(
            JSON.stringify({
              doctor: {
                providerId: "chatgpt",
                activePolicyPack: {
                  id: "low-friction",
                  label: "Low Friction",
                },
                alignment: {
                  story: "dispatchable",
                },
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
        throw new Error("Expected the MCP inspector command test server to expose a TCP port.");
      }

      try {
        const { stdout } = await runExampleCommand("example:mcp-inspector", {
          WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
        });
        const output = parseJsonFromCommandStdout(stdout) as {
          starter: string;
          availableTools: string[];
          runtimeHealth: {
            command: string;
            readOnly: boolean;
            result: { lane: string; totals: { ready: number } };
          };
          providerDoctor: {
            command: string;
            provider: string;
            readOnly: boolean;
            result: {
              doctor: {
                providerId: string;
                activePolicyPack: {
                  id: string;
                  label: string;
                };
                alignment: {
                  story: string;
                };
              };
            };
          };
          catalogTools: Record<string, unknown>;
        };

        expect(output.starter).toBe("read-only-mcp-inspector");
        expect(output.availableTools).toEqual(
          expect.arrayContaining([
            "webai-bridge.runtime.health",
            "webai-bridge.catalog.mcp_tools",
          ]),
        );
        expect(output.runtimeHealth).toMatchObject({
          command: "health",
          readOnly: true,
        });
        expect(output.providerDoctor).toEqual(
          expect.objectContaining({
            command: "provider-doctor",
            provider: "chatgpt",
            readOnly: true,
            result: expect.objectContaining({
              doctor: expect.objectContaining({
                providerId: "chatgpt",
                activePolicyPack: {
                  id: "low-friction",
                  label: "Low Friction",
                },
                alignment: {
                  story: "dispatchable",
                },
              }),
            }),
          }),
        );
        expect(output.runtimeHealth.result).toMatchObject({
          lane: "web",
          totals: expect.objectContaining({
            ready: 5,
          }),
        });
        expect(output.catalogTools).toMatchObject({
          command: "mcp-tools",
          readOnly: true,
        });
        expect(requests).toContain("GET /v1/runtime/health");
        expect(requests).toContain("GET /v1/runtime/providers/chatgpt/doctor");
      } finally {
        await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
      }
    },
    150_000,
  );

  it("fails closed when the runtime bridge alias hits a missing-credential runtime response", async () => {
    const service = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/v1/runtime/invoke") {
        response.statusCode = 409;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            lane: "byok",
            error: {
              type: "missing-credential",
              message: "Missing credential for gemini.",
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
      throw new Error("Expected the missing-credential test server to expose a TCP port.");
    }

    try {
      const failure = await expectCommandFailure("example:runtime-bridge", {
        WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${address.port}`,
      });

      expect(failure.code).not.toBe(0);
      const errorOutput = `${failure.stderr ?? ""}\n${failure.stdout ?? ""}`;
      const missingCredentialFailure =
        errorOutput.includes("HTTP 409") &&
        errorOutput.includes("missing-credential") &&
        errorOutput.includes("Missing credential for gemini.");
      const runtimeUnavailableFailure =
        errorOutput.includes("WebaiBridge runtime is not reachable") &&
        errorOutput.includes("/v1/runtime/invoke");

      expect(missingCredentialFailure || runtimeUnavailableFailure).toBe(true);
    } finally {
      await new Promise<void>((resolveClose) => service.close(() => resolveClose()));
    }
  });

  it("fails truthfully when the runtime bridge alias cannot reach any runtime", async () => {
    const port = await reserveClosedPort();
    const failure = await expectCommandFailure("example:runtime-bridge", {
      WEBAI_BRIDGE_RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
    });

    expect(failure.code).not.toBe(0);
    expect(failure.stderr ?? "").toContain("WebaiBridge runtime is not reachable");
    expect(failure.stderr ?? "").toContain("pnpm run start:service-local");
    expect(failure.stderr ?? "").toContain("/v1/runtime/invoke");
  });
});
