import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";

const MINIMUM_STATEMENTS_PCT = 80;
const MINIMUM_LINES_PCT = 80;
const repoRoot = resolve(process.cwd());
const coverageSummaryPath = join(repoRoot, "coverage", "coverage-summary.json");
const coverageCommand = spawnSync(
  "pnpm",
  ["run", "test:coverage:raw"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if ((coverageCommand.status ?? 1) !== 0) {
  process.exit(coverageCommand.status ?? 1);
}

// Exit code alone is not trusted; the gate also requires a real summary artifact
// and floor checks so a lucky reporter run cannot masquerade as coverage green.
if (!existsSync(coverageSummaryPath)) {
  console.error(
    `WebaiBridge coverage gate expected ${coverageSummaryPath}, but the summary artifact was not created.`,
  );
  process.exit(1);
}

const coverageSummary = JSON.parse(readFileSync(coverageSummaryPath, "utf8"));
const statementsPct = Number(coverageSummary?.total?.statements?.pct ?? NaN);
const linesPct = Number(coverageSummary?.total?.lines?.pct ?? NaN);

if (!Number.isFinite(statementsPct) || !Number.isFinite(linesPct)) {
  console.error(
    "WebaiBridge coverage gate could not read total statement/line coverage from coverage-summary.json.",
  );
  process.exit(1);
}

const failures = [];
if (statementsPct < MINIMUM_STATEMENTS_PCT) {
  failures.push(
    `Statements coverage ${statementsPct.toFixed(2)}% is below ${MINIMUM_STATEMENTS_PCT}%.`,
  );
}

if (linesPct < MINIMUM_LINES_PCT) {
  failures.push(
    `Lines coverage ${linesPct.toFixed(2)}% is below ${MINIMUM_LINES_PCT}%.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`WebaiBridge coverage gate failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `WebaiBridge coverage gate passed: statements=${statementsPct.toFixed(2)}%, lines=${linesPct.toFixed(2)}%.`,
);
