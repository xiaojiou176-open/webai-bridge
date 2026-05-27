import {
  encodeRuntimePathSegment,
  printJson,
  readRepoJson,
  requestJsonAtRuntimePath,
  resolveRuntimeBaseUrl,
} from "../_shared/runtime-example-helpers.mjs";

const examples = readRepoJson("catalogs/starter-manifest-examples.json");
const starter = examples.skillExamples.find(
  (entry) => entry.id === "runtime-diagnostics-pack",
);

if (!starter) {
  throw new Error(
    "Missing runtime-diagnostics-pack example in catalogs/starter-manifest-examples.json.",
  );
}

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

const status = statusPayload.provider ?? statusPayload;
const probe = probePayload.probe ?? probePayload;
const remediation = remediationPayload.remediation ?? remediationPayload;
const supportBundle = supportBundlePayload.debug ?? supportBundlePayload;

printJson({
  starter: "read-only-runtime-diagnostics",
  starterSource: "catalogs/starter-manifest-examples.json#skillExamples[id=runtime-diagnostics-pack]",
  baseUrl,
  provider,
  catalogCommand: starter.example.catalogCommand,
  safeClaims: starter.safeClaims,
  status,
  probe,
  remediation,
  supportBundleSummary: {
    attachTarget: supportBundle.attachTarget ?? null,
    storeReadiness: supportBundle.storeReadiness ?? null,
    liveReadiness: supportBundle.liveReadiness ?? null,
    diagnoseLadderLength: Array.isArray(supportBundle.diagnoseLadder)
      ? supportBundle.diagnoseLadder.length
      : 0,
  },
  supportBundle,
});
