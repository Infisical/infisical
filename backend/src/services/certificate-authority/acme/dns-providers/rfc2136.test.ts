import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dnsMock, resolveTxtByServer, configMock, queryTxtRecordMock } = vi.hoisted(() => {
  const byServer = new Map<string, () => Promise<string[][]>>();
  class Resolver {
    private server = "";

    setServers([server]: string[]) {
      this.server = server;
    }

    resolveTxt() {
      const answer = byServer.get(this.server);
      return answer ? answer() : Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));
    }
  }
  return {
    resolveTxtByServer: byServer,
    dnsMock: {
      NODATA: "ENODATA",
      NOTFOUND: "ENOTFOUND",
      promises: {
        Resolver,
        resolveNs: vi.fn<(zone: string) => Promise<string[]>>(),
        resolve4: vi.fn<(name: string) => Promise<string[]>>(),
        resolve6: vi.fn<(name: string) => Promise<string[]>>()
      }
    },
    configMock: { isCloud: true },
    queryTxtRecordMock: vi.fn()
  };
});

vi.mock("node:dns", () => ({ default: dnsMock }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => configMock }));
// time only moves when the code waits, so the 60-second deadline is reached without real waiting
vi.mock("@app/lib/delay", () => ({
  delay: vi.fn(async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
  })
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/services/app-connection/rfc2136", () => ({
  getRfc2136ErrorMessage: (error: Error) => error.message,
  executeWithRfc2136Client: (
    _connection: unknown,
    _deps: unknown,
    operation: (client: unknown) => Promise<unknown>
  ) =>
    operation({
      findZone: vi.fn(),
      updateTxtRecord: vi.fn().mockResolvedValue(undefined),
      queryTxtRecord: queryTxtRecordMock
    })
}));

// eslint-disable-next-line import/first
import { TRfc2136Connection } from "@app/services/app-connection/rfc2136";

// eslint-disable-next-line import/first
import { rfc2136InsertTxtRecord, waitForPublicNameservers } from "./rfc2136";

const connection = { credentials: { host: "10.0.0.53", tsigSecret: "c2VjcmV0" } } as TRfc2136Connection;
const deps = {} as Parameters<typeof rfc2136InsertTxtRecord>[4];
const NAME = "_acme-challenge.api.corp.com";

const missing = () => Promise.reject(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
const serving = (value: string) => () => Promise.resolve([[value]]);

const setNameservers = (nameservers: Record<string, string[]>) => {
  dnsMock.promises.resolveNs.mockResolvedValue(Object.keys(nameservers));
  dnsMock.promises.resolve4.mockImplementation(async (name) => nameservers[name] ?? []);
  dnsMock.promises.resolve6.mockResolvedValue([]);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.clearAllMocks();
  resolveTxtByServer.clear();
  configMock.isCloud = true;
  setNameservers({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rfc2136 read-back", () => {
  it("asks again until a forwarding secondary serves the record", async () => {
    queryTxtRecordMock
      .mockResolvedValueOnce({ values: [] })
      .mockResolvedValueOnce({ values: [] })
      .mockResolvedValueOnce({ values: ["token"] });

    await rfc2136InsertTxtRecord(connection, "corp.com", NAME, "token", deps);
    expect(queryTxtRecordMock).toHaveBeenCalledTimes(3);
  });

  it("fails once the record never shows up", async () => {
    queryTxtRecordMock.mockResolvedValue({ values: [] });

    await expect(rfc2136InsertTxtRecord(connection, "corp.com", NAME, "token", deps)).rejects.toThrow(
      /does not serve it/
    );
    expect(queryTxtRecordMock).toHaveBeenCalledTimes(10);
  });

  it("fails on a CNAME without asking again", async () => {
    queryTxtRecordMock.mockResolvedValue({ values: [], cnameTarget: "acme.other.com" });

    await expect(rfc2136InsertTxtRecord(connection, "corp.com", NAME, "token", deps)).rejects.toThrow(/CNAME/);
    expect(queryTxtRecordMock).toHaveBeenCalledTimes(1);
  });
});

describe("rfc2136 public nameserver check", () => {
  it("returns once every public nameserver serves the record", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"], "ns2.corp.com": ["45.33.10.2"] });
    resolveTxtByServer.set("45.33.10.1", serving("token"));
    let calls = 0;
    resolveTxtByServer.set("45.33.10.2", () => {
      calls += 1;
      return calls < 3 ? missing() : Promise.resolve([["token"]]);
    });

    await expect(waitForPublicNameservers("corp.com", NAME, "token")).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });

  it("fails on Infisical Cloud when a nameserver that answers never gets the record", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"], "ns2.corp.com": ["45.33.10.2"] });
    resolveTxtByServer.set("45.33.10.1", serving("token"));
    resolveTxtByServer.set("45.33.10.2", missing);

    await expect(waitForPublicNameservers("corp.com", NAME, "token")).rejects.toThrow(
      "Nameserver 'ns2.corp.com' still doesn't serve the challenge record"
    );
  });

  it("only logs on self-hosted instances", async () => {
    configMock.isCloud = false;
    setNameservers({ "ns1.corp.com": ["45.33.10.1"] });
    resolveTxtByServer.set("45.33.10.1", missing);

    await expect(waitForPublicNameservers("corp.com", NAME, "token")).resolves.toBeUndefined();
  });

  it("skips nameservers that do not answer, private addresses and failed lookups", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"], "ns-internal.corp.com": ["10.0.0.53"] });
    resolveTxtByServer.set("10.0.0.53", missing);

    await expect(waitForPublicNameservers("corp.com", NAME, "token")).resolves.toBeUndefined();

    dnsMock.promises.resolveNs.mockRejectedValue(new Error("SERVFAIL"));
    await expect(waitForPublicNameservers("corp.com", NAME, "token")).resolves.toBeUndefined();
  });

  it("stops waiting when the order is cancelled", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"] });
    resolveTxtByServer.set("45.33.10.1", missing);
    const controller = new AbortController();
    controller.abort();

    await expect(waitForPublicNameservers("corp.com", NAME, "token", controller.signal)).resolves.toBeUndefined();
  });
});
