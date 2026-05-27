import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  printJson,
  readPackJson,
  repoRoot,
  resolveRuntimeBaseUrl,
} from "../../_shared/pack-helpers.mjs";

const exampleDocument = readPackJson(import.meta.url, "./example.json");
const starter = exampleDocument.builderExamples[0];
const baseUrl = resolveRuntimeBaseUrl();
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["run", "webai-bridge:mcp", "--", "--base-url", baseUrl],
  cwd: repoRoot,
  stderr: "pipe",
});
const client = new Client({
  name: "webai-bridge-starter-pack-mcp",
  version: "0.0.0",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const health = await client.callTool({
    name: starter.example.toolCall.name,
    arguments: starter.example.toolCall.arguments,
  });

  printJson({
    starterPackId: "mcp",
    baseUrl,
    safeClaims: starter.safeClaims,
    availableTools: tools.tools.map((tool) => tool.name),
    toolResult: health.structuredContent,
  });
} finally {
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
}
