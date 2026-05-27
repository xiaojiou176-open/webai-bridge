import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("service main entrypoint", () => {
  it("starts from process env and closes cleanly on SIGINT", async () => {
    const close = vi.fn(async () => undefined);
    const startFromProcessEnv = vi.fn(async () => ({
      baseUrl: "http://127.0.0.1:4010",
      close,
    }));
    const handlers = new Map<string, () => Promise<void> | void>();
    const originalOn = process.on;
    const onSpy = vi
      .spyOn(process, "on")
      .mockImplementation(((event: string, handler: () => Promise<void> | void) => {
        handlers.set(event, handler);
        return process;
      }) as typeof process.on);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => {
        throw new Error(`EXIT:${code}`);
      }) as never);
    const scriptPath = fileURLToPath(
      new URL("../../../apps/service/src/main.ts", import.meta.url),
    );

    vi.doMock("../../../apps/service/src/index.js", () => ({
      startFromProcessEnv,
    }));

    await import(pathToFileURL(scriptPath).href);

    expect(startFromProcessEnv).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "WebaiBridge local service listening on http://127.0.0.1:4010. Press Ctrl+C to stop.",
    );
    expect(onSpy).toHaveBeenCalled();
    expect(handlers.has("SIGINT")).toBe(true);

    await expect(Promise.resolve(handlers.get("SIGINT")?.())).rejects.toThrow(
      "EXIT:0",
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    process.on = originalOn;
  });
});
