import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

import { requestWithHCVaultGateway } from "@app/services/app-connection/hc-vault";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { HCVaultSyncFns } from "./hc-vault-sync-fns";
import { THCVaultSyncWithCredentials } from "./hc-vault-sync-types";

vi.mock("@app/services/app-connection/hc-vault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/services/app-connection/hc-vault")>();
  return {
    ...actual,
    getHCVaultAccessToken: vi.fn(() => Promise.resolve("vault-token")),
    getHCVaultInstanceUrl: vi.fn(() => Promise.resolve("https://vault.example.com")),
    requestWithHCVaultGateway: vi.fn()
  };
});

const VAULT = "https://vault.example.com";

type TFakeMount = { type: string; version?: "1" | "2" };

const notFound = () =>
  new AxiosError("Request failed with status code 404", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 404,
    statusText: "Not Found",
    headers: {},
    config: {},
    data: { errors: [] }
  } as AxiosResponse);

const decodePath = (pathname: string) => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

// In-memory Vault serving sys/mounts and KV v1 and v2 reads, writes and deletes, keyed by mount and path.
const createFakeVault = (mounts: Record<string, TFakeMount>) => {
  const secrets = new Map<string, Record<string, string>>();
  const requests: string[] = [];

  const findMount = (apiPath: string) =>
    Object.keys(mounts)
      .filter((mountPath) => apiPath.startsWith(mountPath))
      .sort((a, b) => b.length - a.length)[0];

  const handle = async (config: AxiosRequestConfig) => {
    const method = (config.method ?? "GET").toUpperCase();
    requests.push(`${method} ${config.url as string}`);

    const pathname = decodePath(new URL(config.url as string).pathname);
    const apiPath = pathname.startsWith("/v1/") ? pathname.slice("/v1/".length) : pathname;

    if (method === "GET" && apiPath === "sys/mounts") {
      return {
        data: {
          data: Object.fromEntries(
            Object.entries(mounts).map(([mountPath, { type, version }]) => [
              mountPath,
              { type, options: version ? { version } : null }
            ])
          )
        }
      };
    }

    const mountPath = findMount(apiPath);
    if (!mountPath) throw notFound();

    const isKvV2 = mounts[mountPath].version === "2";
    const pathInMount = apiPath.slice(mountPath.length);
    if (isKvV2 && !pathInMount.startsWith("data/")) throw notFound();

    const key = `${mountPath}${isKvV2 ? pathInMount.slice("data/".length) : pathInMount}`;

    if (method === "GET") {
      const stored = secrets.get(key);
      if (!stored) throw notFound();
      return { data: isKvV2 ? { data: { data: { ...stored } } } : { data: { ...stored } } };
    }

    if (method === "POST") {
      const written = isKvV2
        ? (config.data as { data: Record<string, string> }).data
        : (config.data as Record<string, string>);
      secrets.set(key, { ...written });
      return { data: {} };
    }

    if (method === "DELETE") {
      secrets.delete(key);
      return { data: {} };
    }

    throw notFound();
  };

  vi.mocked(requestWithHCVaultGateway).mockImplementation(
    (_connection, _gatewayV2Service, config) => handle(config) as never
  );

  return {
    requests,
    read: (mountPath: string, path: string) => secrets.get(`${mountPath}${path}`),
    seed: (mountPath: string, path: string, data: Record<string, string>) =>
      secrets.set(`${mountPath}${path}`, { ...data }),
    snapshot: () => JSON.stringify([...secrets.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
};

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn(() => Promise.resolve(null)) };

const buildSync = (mount: string, path: string) =>
  ({
    connection: { gatewayId: null, gatewayPoolId: null, credentials: {} },
    environment: { slug: "prod" },
    destinationConfig: { mount, path },
    syncOptions: { disableSecretDeletion: false }
  }) as unknown as THCVaultSyncWithCredentials;

const payloadOf = (values: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const syncSecrets = (sync: THCVaultSyncWithCredentials, values: Record<string, string> = { API_KEY: "one" }) =>
  HCVaultSyncFns.syncSecrets(sync, payloadOf(values), gatewayV2Service, gatewayPoolService);

const removeSecrets = (sync: THCVaultSyncWithCredentials, values: Record<string, string> = { API_KEY: "one" }) =>
  HCVaultSyncFns.removeSecrets(sync, payloadOf(values), gatewayV2Service, gatewayPoolService);

const getSecrets = (sync: THCVaultSyncWithCredentials) =>
  HCVaultSyncFns.getSecrets(sync, gatewayV2Service, gatewayPoolService);

describe("HCVaultSyncFns", () => {
  beforeEach(() => {
    vi.mocked(requestWithHCVaultGateway).mockReset();
  });

  test("writes synced secrets to a KV v2 path under its data prefix and reads them back", async () => {
    const vault = createFakeVault({ "kv/": { type: "kv", version: "2" } });

    await syncSecrets(buildSync("kv", "team/app"), { API_KEY: "one", DB_HOST: "two" });

    expect(vault.read("kv/", "team/app")).toEqual({ API_KEY: "one", DB_HOST: "two" });
    expect(vault.requests).toEqual([
      `GET ${VAULT}/v1/sys/mounts`,
      `GET ${VAULT}/v1/kv/data/team/app`,
      `POST ${VAULT}/v1/kv/data/team/app`
    ]);
    expect(await getSecrets(buildSync("kv", "team/app"))).toEqual({
      API_KEY: { value: "one" },
      DB_HOST: { value: "two" }
    });
  });

  test("keeps a KV v2 path with empty data when its last secret is removed", async () => {
    const vault = createFakeVault({ "kv/": { type: "kv", version: "2" } });
    await syncSecrets(buildSync("kv", "team/app"));

    await removeSecrets(buildSync("kv", "team/app"));

    expect(vault.read("kv/", "team/app")).toEqual({});
    expect(vault.requests.filter((request) => request.startsWith("DELETE"))).toEqual([]);
  });

  test("writes to a KV v1 path without the data prefix and deletes it when its last secret is removed", async () => {
    const vault = createFakeVault({ "kv/": { type: "kv", version: "1" } });

    await syncSecrets(buildSync("kv", "team/app"));
    expect(vault.read("kv/", "team/app")).toEqual({ API_KEY: "one" });
    expect(vault.requests).toContain(`POST ${VAULT}/v1/kv/team/app`);

    await removeSecrets(buildSync("kv", "team/app"));
    expect(vault.read("kv/", "team/app")).toBeUndefined();
    expect(vault.requests).toContain(`DELETE ${VAULT}/v1/kv/team/app`);
  });

  test("accepts a legacy 'generic' mount as KV v1", async () => {
    const vault = createFakeVault({ "legacy/": { type: "generic" } });

    await syncSecrets(buildSync("legacy", "team/app"));

    expect(vault.read("legacy/", "team/app")).toEqual({ API_KEY: "one" });
    expect(vault.requests).toContain(`POST ${VAULT}/v1/legacy/team/app`);
  });

  test("requests a mount whose name contains a space as written", async () => {
    const vault = createFakeVault({ "team kv/": { type: "kv", version: "2" } });

    await syncSecrets(buildSync("team kv", "app"));

    expect(vault.read("team kv/", "app")).toEqual({ API_KEY: "one" });
    expect(vault.requests).toContain(`POST ${VAULT}/v1/team kv/data/app`);
  });

  describe.each([
    ["syncSecrets", syncSecrets],
    ["removeSecrets", removeSecrets],
    ["getSecrets", getSecrets]
  ] as const)("%s", (_name, operation) => {
    test("refuses a mount that is not a KV secrets engine and changes nothing", async () => {
      const vault = createFakeVault({ "database/": { type: "database" } });
      vault.seed("database/", "team/app", { EXISTING: "keep" });
      const before = vault.snapshot();

      const result = operation(buildSync("database", "team/app"));

      await expect(result).rejects.toBeInstanceOf(SecretSyncError);
      await expect(result).rejects.toThrowError(/is a 'database' engine/);
      expect(vault.snapshot()).toBe(before);
      expect(vault.requests).toEqual([`GET ${VAULT}/v1/sys/mounts`]);
    });

    test.each(["kv/..", "../kv", "%2e%2e"])("refuses the stored mount '%s' before any request", async (mount) => {
      const vault = createFakeVault({ "kv/": { type: "kv", version: "1" } });
      vault.seed("kv/", "team/app", { EXISTING: "keep" });
      const before = vault.snapshot();

      const result = operation(buildSync(mount, "team/app"));

      await expect(result).rejects.toBeInstanceOf(SecretSyncError);
      await expect(result).rejects.toThrowError(/Secrets engine mount .* cannot contain '\.' or '\.\.' path segments/);
      expect(vault.snapshot()).toBe(before);
      expect(vault.requests).toEqual([]);
    });

    test.each(["../other/app", "x/../../other/app", "%2e%2e/other/app"])(
      "refuses the stored path '%s' and leaves the secret it would resolve to unchanged",
      async (path) => {
        const vault = createFakeVault({ "kv/": { type: "kv", version: "1" }, "other/": { type: "kv", version: "1" } });
        vault.seed("other/", "app", { EXISTING: "keep" });
        const before = vault.snapshot();

        const result = operation(buildSync("kv", path));

        await expect(result).rejects.toBeInstanceOf(SecretSyncError);
        await expect(result).rejects.toThrowError(/cannot contain '\.' or '\.\.' path segments/);
        expect(vault.snapshot()).toBe(before);
        expect(vault.requests).toEqual([`GET ${VAULT}/v1/sys/mounts`]);
      }
    );

    test.each(["app#x", "app?x"])(
      "refuses the stored path '%s' and leaves the secret it would resolve to unchanged",
      async (path) => {
        const vault = createFakeVault({ "kv/": { type: "kv", version: "1" } });
        vault.seed("kv/", "app", { EXISTING: "keep" });
        const before = vault.snapshot();

        const result = operation(buildSync("kv", path));

        await expect(result).rejects.toBeInstanceOf(SecretSyncError);
        await expect(result).rejects.toThrowError(/cannot contain '\?', '#'/);
        expect(vault.snapshot()).toBe(before);
        expect(vault.requests).toEqual([`GET ${VAULT}/v1/sys/mounts`]);
      }
    );

    test.each(["team#1", "team?1"])("refuses the stored mount '%s' after the mounts lookup", async (mount) => {
      const vault = createFakeVault({ [`${mount}/`]: { type: "kv", version: "2" } });

      const result = operation(buildSync(mount, "app"));

      await expect(result).rejects.toBeInstanceOf(SecretSyncError);
      await expect(result).rejects.toThrowError(/cannot contain '\?', '#'/);
      expect(vault.requests).toEqual([`GET ${VAULT}/v1/sys/mounts`]);
    });
  });
});
