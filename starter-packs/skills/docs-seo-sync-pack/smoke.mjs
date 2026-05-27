import {
  printJson,
  readPackJson,
  readRepoJson,
  readRepoText,
} from "../../_shared/pack-helpers.mjs";

const exampleDocument = readPackJson(import.meta.url, "./example.json");
const starter = exampleDocument.skillExamples[0];
const routeDocument = readRepoJson("catalogs/skill-pack-routes.json");
const route = routeDocument.routes.find((entry) => entry.id === "docs-seo-sync-pack");
const catalog = readRepoJson("catalogs/public-surface-catalog.json");
const keywordTruth = readRepoText("docs/discoverability-keyword-truth.md");
const supportMatrix = readRepoText("docs/public-surface-support-matrix.md");

printJson({
  starterPackId: "docs-seo-sync-pack",
  route,
  safeClaims: starter.safeClaims,
  catalogVersion: catalog.catalogVersion,
  publicSurfaceCount: catalog.publicSurfaces.length,
  compatTargetCount: catalog.compatTargets.length,
  keywordTruthHasWebaiBridge: keywordTruth.includes("WebaiBridge"),
  supportMatrixHasPartial: supportMatrix.includes("`partial`"),
});
