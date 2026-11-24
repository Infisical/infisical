import dns from "node:dns";
import net from "node:net";

import { afterEach, beforeEach, expect, MockInstance, test, vi } from "vitest";

import { isPasswordBreached } from "./breached-password";

type TConfig = { BREACHED_PASSWORD_CHECK_ENABLED?: boolean; isCloud: boolean; INFISICAL_DEDICATED: boolean };

const mocks = vi.hoisted(() => ({ config: {} as TConfig }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => mocks.config }));
vi.mock("@app/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@app/lib/logger/logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

const DEPLOYMENTS = {
  cloud: { isCloud: true, INFISICAL_DEDICATED: false },
  dedicated: { isCloud: false, INFISICAL_DEDICATED: true },
  "self-hosted": { isCloud: false, INFISICAL_DEDICATED: false }
};

let lookup: MockInstance;
let connect: MockInstance;

beforeEach(() => {
  // Resolution fails, so an enabled check stops at the network edge.
  lookup = vi.spyOn(dns, "lookup").mockImplementation(((...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: Error) => void;
    process.nextTick(() =>
      callback(Object.assign(new Error("getaddrinfo ENOTFOUND api.pwnedpasswords.com"), { code: "ENOTFOUND" }))
    );
  }) as never);
  connect = vi.spyOn(net.Socket.prototype, "connect");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test.each([
  { deployment: "cloud", enabled: undefined, looksUp: true },
  { deployment: "cloud", enabled: true, looksUp: true },
  { deployment: "cloud", enabled: false, looksUp: false },
  { deployment: "dedicated", enabled: undefined, looksUp: true },
  { deployment: "dedicated", enabled: true, looksUp: true },
  { deployment: "dedicated", enabled: false, looksUp: false },
  { deployment: "self-hosted", enabled: undefined, looksUp: false },
  { deployment: "self-hosted", enabled: true, looksUp: true },
  { deployment: "self-hosted", enabled: false, looksUp: false }
] as const)(
  "$deployment with BREACHED_PASSWORD_CHECK_ENABLED=$enabled looks up the password: $looksUp",
  async ({ deployment, enabled, looksUp }) => {
    mocks.config = { ...DEPLOYMENTS[deployment], BREACHED_PASSWORD_CHECK_ENABLED: enabled };

    expect(await isPasswordBreached("Correct-Horse-Battery-7!")).toBe(false);

    if (looksUp) {
      expect(lookup).toHaveBeenCalledWith("api.pwnedpasswords.com", expect.anything(), expect.any(Function));
    } else {
      expect(lookup).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    }
  }
);
