import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  normalizeInvokeRequest,
  printJson,
  repoRoot,
  requestJsonAtRuntimePath,
  resolveRuntimeBaseUrl,
} from "../../_shared/runtime-example-helpers.mjs";

const helpersDir = dirname(fileURLToPath(import.meta.url));

export { printJson, repoRoot, requestJsonAtRuntimePath, resolveRuntimeBaseUrl };

export function readHostConfig(moduleUrl) {
  const hostDir = dirname(fileURLToPath(moduleUrl));
  return JSON.parse(
    readFileSync(resolve(hostDir, "./config.example.json"), "utf8"),
  );
}

export function resolveHostExampleMeta(target) {
  const index = JSON.parse(
    readFileSync(resolve(helpersDir, "../index.json"), "utf8"),
  );
  const result = index.hostExamples.find((entry) => entry.target === target);

  if (!result) {
    throw new Error(`Missing host example metadata for "${target}".`);
  }

  return result;
}

export async function runInvokeStyleHostExample(target, moduleUrl) {
  const config = readHostConfig(moduleUrl);
  const meta = resolveHostExampleMeta(target);
  const baseUrl = resolveRuntimeBaseUrl();
  const request = normalizeInvokeRequest(config.request);
  const response = await requestJsonAtRuntimePath("/v1/runtime/invoke", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  printJson({
    starter: `host-example-${target}`,
    target,
    baseUrl,
    bestEntry: meta.bestEntry,
    smokeCommand: meta.smokeCommand,
    catalogCommand: config.catalogCommand,
    safeClaims: meta.safeClaims,
    request,
    response,
  });
}

export async function runMcpStyleHostExample(moduleUrl) {
  const config = readHostConfig(moduleUrl);
  const meta = resolveHostExampleMeta("mcp");
  const baseUrl = resolveRuntimeBaseUrl();
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["run", "webai-bridge:mcp", "--", "--base-url", baseUrl],
    cwd: repoRoot,
    stderr: "pipe",
  });
  const client = new Client({
    name: config.name,
    version: "0.0.0",
  });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const toolCall = {
      name: config.firstToolCall.name,
      ...(config.firstToolCall.arguments &&
      Object.keys(config.firstToolCall.arguments).length > 0
        ? { arguments: config.firstToolCall.arguments }
        : {}),
    };
    const toolResult = await client.callTool(toolCall);

    printJson({
      starter: "host-example-mcp",
      target: "mcp",
      baseUrl,
      bestEntry: meta.bestEntry,
      smokeCommand: meta.smokeCommand,
      catalogCommand: config.catalogCommand,
      startupCommand: config.startupCommand,
      safeClaims: meta.safeClaims,
      availableTools: tools.tools.map((tool) => tool.name),
      toolResult: toolResult.structuredContent ?? toolResult,
    });
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}
