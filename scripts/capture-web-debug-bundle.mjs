import "./load-local-env.mjs";

import { captureBrowserDebugContext } from "./browser-debug-support.mjs";
import { isCiEnvironment } from "./runtime-policy.mjs";
import { repoRoot } from "./runtime-policy.mjs";
import { runLightweightRuntimePrune } from "./runtime-cache-maintenance.mjs";

function parseProviderArgs(argv = process.argv.slice(2)) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--provider") {
      const value = argv[index + 1];

      if (!value?.trim()) {
        throw new Error("Missing value for --provider.");
      }

      return value.trim().toLowerCase();
    }

    if (arg.startsWith("--provider=")) {
      return arg.slice("--provider=".length).trim().toLowerCase();
    }
  }

  throw new Error("capture-web-debug-bundle requires --provider.");
}

async function main() {
  if (isCiEnvironment(process.env)) {
    throw new Error(
      "WebaiBridge capture:web-debug-bundle is credentialed-workstation only and must not run inside CI.",
    );
  }

  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
  const provider = parseProviderArgs();
  const debugContext = await captureBrowserDebugContext(
    provider,
    {
      status: "external-blocker",
      classification: "diagnose-ladder",
      blocker: "manual-debug-bundle",
      summary: "Manual browser debug bundle capture requested.",
    },
    process.env,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider,
        debugContext,
      },
      null,
      2,
    ),
  );
  runLightweightRuntimePrune({
    repoRoot,
    env: process.env,
  });
}

await main();
