import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("webai-bridge MCP CLI", () => {
  it("parses args, resolves the base URL, and starts the stdio server", async () => {
    const parseMcpArgs = vi.fn(() => ({
      baseUrl: "http://127.0.0.1:4010/",
    }));
    const resolveMcpBaseUrl = vi.fn(() => "http://127.0.0.1:4010");
    const runWebaiBridgeMcpStdioServer = vi.fn(async () => undefined);

    vi.doMock("../../../packages/surfaces/mcp/src/index.js", () => ({
      parseMcpArgs,
      resolveMcpBaseUrl,
      runWebaiBridgeMcpStdioServer,
    }));

    const { runWebaiBridgeMcpCli } = await import(
      "../../../packages/surfaces/mcp/src/cli.js"
    );

    await runWebaiBridgeMcpCli(["--base-url", "http://127.0.0.1:4010/"]);

    expect(parseMcpArgs).toHaveBeenCalledWith([
      "--base-url",
      "http://127.0.0.1:4010/",
    ]);
    expect(resolveMcpBaseUrl).toHaveBeenCalledWith(
      process.env,
      "http://127.0.0.1:4010/",
    );
    expect(runWebaiBridgeMcpStdioServer).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4010",
    });
  });
});
