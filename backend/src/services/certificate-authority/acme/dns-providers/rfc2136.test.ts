import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dnsMock, resolveTxtByServer, queriedServers, configMock, queryTxtRecordMock } = vi.hoisted(() => {
  const byServer = new Map<string, () => Promise<string[][]>>();
  const queried: string[] = [];
  class Resolver {
    private server = "";

    setServers([server]: string[]) {
      this.server = server;
    }

    resolveTxt() {
      queried.push(this.server);
      const answer = byServer.get(this.server);
      return answer ? answer() : Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));
    }
  }
  return {
    resolveTxtByServer: byServer,
    queriedServers: queried,
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

vi.mock("dns", () => ({ default: dnsMock }));
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
  executeWithRfc2136Client: (_connection: unknown, _deps: unknown, operation: (client: unknown) => Promise<unknown>) =>
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
  queriedServers.length = 0;
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

  it("keeps waiting on a nameserver that answered once and then timed out", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"] });
    let calls = 0;
    resolveTxtByServer.set("45.33.10.1", () => {
      calls += 1;
      if (calls === 1) return missing();
      if (calls === 2) return Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }));
      return Promise.resolve([["token"]]);
    });

    await expect(waitForPublicNameservers("corp.com", NAME, "token")).resolves.toBeUndefined();
    expect(calls).toBe(3);

    resolveTxtByServer.set("45.33.10.1", () =>
      queriedServers.length === 4
        ? missing()
        : Promise.reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" }))
    );
    await expect(waitForPublicNameservers("corp.com", NAME, "token")).rejects.toThrow(/still doesn't serve/);
  });

  it("asks at most 10 nameservers, one address each, never the same address twice", async () => {
    const nameservers: Record<string, string[]> = {};
    for (let i = 1; i <= 15; i += 1) nameservers[`ns${i}.corp.com`] = [`45.33.10.${i}`, `45.33.11.${i}`];
    nameservers["ns2.corp.com"] = ["45.33.10.1"];
    setNameservers(nameservers);
    for (let i = 1; i <= 15; i += 1) resolveTxtByServer.set(`45.33.10.${i}`, serving("token"));

    await waitForPublicNameservers("corp.com", NAME, "token");
    expect(queriedServers).toHaveLength(9);
    expect(new Set(queriedServers).size).toBe(9);
    expect(queriedServers.some((ip) => ip.startsWith("45.33.11."))).toBe(false);
  });

  it("stops polling when the order is cancelled", async () => {
    setNameservers({ "ns1.corp.com": ["45.33.10.1"] });
    const controller = new AbortController();
    resolveTxtByServer.set("45.33.10.1", () => {
      if (queriedServers.length === 2) controller.abort();
      return missing();
    });

    await expect(waitForPublicNameservers("corp.com", NAME, "token", controller.signal)).resolves.toBeUndefined();
    expect(queriedServers).toHaveLength(2);
  });

  it("runs after the read-back when a certificate order adds the record", async () => {
    queryTxtRecordMock.mockResolvedValue({ values: ["token"] });
    setNameservers({ "ns1.corp.com": ["45.33.10.1"] });
    resolveTxtByServer.set("45.33.10.1", missing);

    await expect(rfc2136InsertTxtRecord(connection, "corp.com", NAME, "token", deps)).rejects.toThrow(
      "Nameserver 'ns1.corp.com' still doesn't serve the challenge record"
    );
    expect(dnsMock.promises.resolveNs).toHaveBeenCalledWith("corp.com");
  });
});
