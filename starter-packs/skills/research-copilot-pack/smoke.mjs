import {
  printJson,
  readPackJson,
  readRepoJson,
  readRepoText,
} from "../../_shared/pack-helpers.mjs";

const exampleDocument = readPackJson(import.meta.url, "./example.json");
const starter = exampleDocument.skillExamples[0];
const routeDocument = readRepoJson("catalogs/skill-pack-routes.json");
const route =
  routeDocument.routes.find((entry) => entry.id === "research-copilot-pack") ?? null;
const surfaceCatalog = readRepoJson("catalogs/public-surface-catalog.json");
const compatCatalog = readRepoJson("catalogs/compat-target-catalog.json");
const keywordTruth = readRepoJson("catalogs/discoverability-keyword-truth.json");
const supportMatrix = readRepoText("docs/public-surface-support-matrix.md");
const webai-bridgeKeyword =
  keywordTruth.entries.find((entry) => entry.term === "WebaiBridge") ?? null;

printJson({
  starterPackId: "research-copilot-pack",
  route,
  safeClaims: starter.safeClaims,
  publicSurfaceCount: surfaceCatalog.publicSurfaces.length,
  compatTargetCount: compatCatalog.targets.length,
  keywordEntryCount: keywordTruth.entries.length,
  webai-bridgeKeywordTruth: webai-bridgeKeyword?.truthStatus ?? null,
  supportMatrixHasPartialLabel: supportMatrix.includes("`partial`"),
});
