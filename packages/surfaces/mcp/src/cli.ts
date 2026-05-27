import process from "node:process";

import {
  parseMcpArgs,
  resolveMcpBaseUrl,
  runWebaiBridgeMcpStdioServer,
} from "./index.js";

export async function runWebaiBridgeMcpCli(argv = process.argv.slice(2)) {
  const options = parseMcpArgs(argv);
  const baseUrl = resolveMcpBaseUrl(process.env, options.baseUrl);

  return runWebaiBridgeMcpStdioServer({ baseUrl });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runWebaiBridgeMcpCli();
}
