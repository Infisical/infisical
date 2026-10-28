import { EventEmitter } from "node:events";

import type { Redis } from "ioredis";

import { logger } from "@app/lib/logger";

import { attachConnectionLogging, createThrottledRedisErrorLogger } from "./redis";

vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const refused = () => Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:6379"), { code: "ECONNREFUSED" });
const loggedLine = (call: number) => vi.mocked(logger.error).mock.calls[call]?.[1] as unknown;

describe("createThrottledRedisErrorLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(logger.error).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("callers sharing a logger share one limit per error key, and their fields are logged", () => {
    const { log } = createThrottledRedisErrorLogger("queue-workers", "Queue worker error");
    log(refused(), undefined, { queue: "audit-log" });
    log(refused(), undefined, { queue: "secret-sync" });
    log(refused(), undefined, { queue: "audit-log" });
    expect(logger.error).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    log(refused(), undefined, { queue: "secret-sync" });
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(loggedLine(1)).toBe(
      "Queue worker error [client=queue-workers] [error=ECONNREFUSED] [suppressedCount=2] [queue=secret-sync] [message=connect ECONNREFUSED 10.0.0.1:6379]"
    );
  });

  test("attachConnectionLogging keeps its connection error line", () => {
    const client = new EventEmitter() as unknown as Redis;
    attachConnectionLogging(client, "main");
    client.emit("error", refused());
    expect(loggedLine(0)).toBe(
      "Redis connection error [client=main] [error=ECONNREFUSED] [suppressedCount=0] [message=connect ECONNREFUSED 10.0.0.1:6379]"
    );
  });
});
