import {
  encodeRuntimePathSegment,
  printJson,
  readPackJson,
  readRepoJson,
  requestJsonAtRuntimePath,
  resolveRuntimeBaseUrl,
} from "../../_shared/pack-helpers.mjs";

const exampleDocument = readPackJson(import.meta.url, "./example.json");
const starter = exampleDocument.skillExamples[0];
const routeDocument = readRepoJson("catalogs/skill-pack-routes.json");
const route = routeDocument.routes.find((entry) => entry.id === "runtime-diagnostics-pack");
const provider = process.env.WEBAI_BRIDGE_RUNTIME_PROVIDER?.trim() || "chatgpt";
const encodedProvider = encodeRuntimePathSegment(
  provider,
  "WebaiBridge runtime diagnostics provider",
);
const baseUrl = resolveRuntimeBaseUrl();

const [statusPayload, probePayload, remediationPayload, supportBundlePayload] =
  await Promise.all([
    requestJsonAtRuntimePath(`/v1/runtime/providers/${encodedProvider}/status`),
    requestJsonAtRuntimePath(`/v1/runtime/providers/${encodedProvider}/probe`),
    requestJsonAtRuntimePath(`/v1/runtime/providers/${encodedProvider}/remediation`),
    requestJsonAtRuntimePath(
      `/v1/runtime/providers/${encodedProvider}/debug/support-bundle`,
    ),
  ]);

printJson({
  starterPackId: "runtime-diagnostics-pack",
  baseUrl,
  provider,
  route,
  safeClaims: starter.safeClaims,
  status: statusPayload.provider ?? statusPayload,
  probe: probePayload.probe ?? probePayload,
  remediation: remediationPayload.remediation ?? remediationPayload,
  supportBundle: supportBundlePayload.debug ?? supportBundlePayload,
});
