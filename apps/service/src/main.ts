import { startFromProcessEnv } from "./index.js";

const service = await startFromProcessEnv();

console.log(
  `WebaiBridge local service listening on ${service.baseUrl}. Press Ctrl+C to stop.`,
);

process.on("SIGINT", async () => {
  await service.close();
  process.exit(0);
});
