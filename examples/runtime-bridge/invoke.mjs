import {
  printJson,
  readRepoJson,
  requestJsonAtRuntimePath,
  resolveRuntimeBaseUrl,
} from "../_shared/runtime-example-helpers.mjs";

const examples = readRepoJson("catalogs/starter-manifest-examples.json");
const starter = examples.builderExamples.find((entry) => entry.target === "codex");

if (!starter) {
  throw new Error("Missing codex builder example in catalogs/starter-manifest-examples.json.");
}

const baseUrl = resolveRuntimeBaseUrl();
const request = {
  provider: process.env.WEBAI_BRIDGE_RUNTIME_PROVIDER?.trim() || "openai",
  model: process.env.WEBAI_BRIDGE_RUNTIME_MODEL?.trim() || starter.example.request.model,
  input: process.env.WEBAI_BRIDGE_RUNTIME_INPUT?.trim() || starter.example.request.input,
  lane: process.env.WEBAI_BRIDGE_RUNTIME_LANE?.trim() || "byok",
};

const response = await requestJsonAtRuntimePath("/v1/runtime/invoke", {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify(request),
});

printJson({
  starter: "thin-runtime-bridge",
  starterSource: "catalogs/starter-manifest-examples.json#builderExamples[target=codex]",
  baseUrl,
  catalogCommand: starter.example.catalogCommand,
  safeClaims: starter.safeClaims,
  request,
  response,
});
