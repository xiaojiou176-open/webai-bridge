import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  printJson,
  readRepoJson,
  repoRoot,
  resolveRuntimeBaseUrl,
} from "../_shared/runtime-example-helpers.mjs";

const templates = readRepoJson("catalogs/starter-manifest-templates.json");
const starter = templates.builderTemplates.find((entry) => entry.target === "mcp");

if (!starter) {
  throw new Error("Missing mcp builder template in catalogs/starter-manifest-templates.json.");
}

const baseUrl = resolveRuntimeBaseUrl();
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["run", "webai-bridge:mcp", "--", "--base-url", baseUrl],
  cwd: repoRoot,
  stderr: "pipe",
});
const client = new Client({
  name: "webai-bridge-mcp-inspector-starter",
  version: "0.0.0",
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const runtimeHealth = await client.callTool({
    name: "webai-bridge.runtime.health",
  });
  const providerDoctor = await client.callTool({
    name: "webai-bridge.provider.doctor",
    arguments: {
      provider: "chatgpt",
    },
  });
  const catalogTools = await client.callTool({
    name: "webai-bridge.catalog.mcp_tools",
  });

  printJson({
    starter: "read-only-mcp-inspector",
    starterSource: "catalogs/starter-manifest-templates.json#builderTemplates[target=mcp]",
    baseUrl,
    startupCommand: starter.manifest.startupCommand,
    safeClaims: starter.manifest.safeClaims,
    availableTools: tools.tools.map((tool) => tool.name),
    runtimeHealth: runtimeHealth.structuredContent,
    providerDoctor: providerDoctor.structuredContent,
    catalogTools: catalogTools.structuredContent,
  });
} finally {
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
}
