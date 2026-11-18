import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { GCPSecretManagerLocation, GcpSyncScope } from "./gcp-sync-enums";
import { GcpSyncFns } from "./gcp-sync-fns";
import { TGcpSyncWithCredentials } from "./gcp-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/request")>()),
  request: { get, post, delete: del }
}));
vi.mock("@app/services/app-connection/gcp", () => ({ getGcpConnectionAuthToken: async () => "token" }));

const GLOBAL_URL = "https://secretmanager.googleapis.com/v1/projects/my-project";

const makeSync = (keySchema?: string, regional = false) =>
  ({
    destinationConfig: regional
      ? { scope: GcpSyncScope.Region, projectId: "my-project", locationId: GCPSecretManagerLocation.US_CENTRAL1 }
      : { scope: GcpSyncScope.Global, projectId: "my-project", userReplicaLocationIds: [] },
    environment: { slug: "prod" },
    syncOptions: { keySchema, disableSecretDeletion: false },
    connection: {}
  }) as unknown as TGcpSyncWithCredentials;

const makePayload = (values: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) as TSecretMap
  }) as unknown as TSecretSyncPayload;

const notFound = () =>
  new AxiosError("not found", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 404,
    statusText: "Not Found",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {}
  });

const mockGcp = (secrets: Record<string, string | null>) => {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/secrets")) {
      return { data: { secrets: Object.keys(secrets).map((key) => ({ name: `projects/123/secrets/${key}` })) } };
    }
    const key = url.split("/secrets/")[1].split("/")[0];
    const value = secrets[key];
    if (value === null || value === undefined) throw notFound();
    return { data: { payload: { data: Buffer.from(value).toString("base64") } } };
  });
};

const accessedKeys = () =>
  get.mock.calls
    .map(([url]) => url as string)
    .filter((url) => url.endsWith(":access"))
    .map((url) => url.split("/secrets/")[1].split("/")[0]);

const postedUrls = () => post.mock.calls.map(([url]) => url as string);
const deletedUrls = () => del.mock.calls.map(([url]) => url as string);

describe("GCP sync reads only the values of secrets it manages", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
  });

  it("syncs with a key schema without reading secrets outside it", async () => {
    mockGcp({ INFISICAL_SAME: "same", INFISICAL_CHANGED: "old", INFISICAL_ORPHAN: "orphan", OTHER: "unmanaged" });

    await GcpSyncFns.syncSecrets(
      makeSync("INFISICAL_{{secretKey}}"),
      makePayload({ INFISICAL_SAME: "same", INFISICAL_CHANGED: "new", INFISICAL_NEW: "created" })
    );

    expect(accessedKeys().sort()).toEqual(["INFISICAL_CHANGED", "INFISICAL_SAME"]);
    expect(postedUrls()).toEqual([
      `${GLOBAL_URL}/secrets`,
      `${GLOBAL_URL}/secrets/INFISICAL_NEW:addVersion`,
      `${GLOBAL_URL}/secrets/INFISICAL_CHANGED:addVersion`
    ]);
    expect(deletedUrls()).toEqual([`${GLOBAL_URL}/secrets/INFISICAL_ORPHAN`]);
  });

  it("syncs without a key schema reading only secrets present in Infisical", async () => {
    mockGcp({ API_KEY: "old", UNMANAGED: "unmanaged" });

    await GcpSyncFns.syncSecrets(makeSync(), makePayload({ API_KEY: "new" }));

    expect(accessedKeys()).toEqual(["API_KEY"]);
    expect(postedUrls()).toEqual([`${GLOBAL_URL}/secrets/API_KEY:addVersion`]);
    expect(deletedUrls()).toEqual([`${GLOBAL_URL}/secrets/UNMANAGED`]);
  });

  it("does not read the value of a secret that is being deleted", async () => {
    mockGcp({ INFISICAL_EMPTY: "old" });

    await GcpSyncFns.syncSecrets(makeSync("INFISICAL_{{secretKey}}"), makePayload({ INFISICAL_EMPTY: "" }));

    expect(accessedKeys()).toEqual([]);
    expect(deletedUrls()).toEqual([`${GLOBAL_URL}/secrets/INFISICAL_EMPTY`]);
  });

  it("adds a version when a managed secret has no readable version", async () => {
    mockGcp({ INFISICAL_A: null });

    await GcpSyncFns.syncSecrets(makeSync("INFISICAL_{{secretKey}}"), makePayload({ INFISICAL_A: "value" }));

    expect(postedUrls()).toEqual([`${GLOBAL_URL}/secrets/INFISICAL_A:addVersion`]);
  });

  it("uses the regional endpoint", async () => {
    mockGcp({ INFISICAL_A: "old" });

    await GcpSyncFns.syncSecrets(makeSync("INFISICAL_{{secretKey}}", true), makePayload({ INFISICAL_A: "new" }));

    expect(postedUrls()).toEqual([
      "https://secretmanager.us-central1.rep.googleapis.com/v1/projects/my-project/locations/us-central1/secrets/INFISICAL_A:addVersion"
    ]);
  });

  it("imports only secrets that match the key schema", async () => {
    mockGcp({ INFISICAL_A: "a", OTHER: "unmanaged" });

    const secrets = await GcpSyncFns.getSecrets(makeSync("INFISICAL_{{secretKey}}"));

    expect(accessedKeys()).toEqual(["INFISICAL_A"]);
    expect(secrets).toEqual({ INFISICAL_A: { value: "a" } });
  });

  it("removes secrets without reading any value", async () => {
    mockGcp({ INFISICAL_A: "a", OTHER: "unmanaged" });

    await GcpSyncFns.removeSecrets(makeSync("INFISICAL_{{secretKey}}"), makePayload({ INFISICAL_A: "a" }));

    expect(accessedKeys()).toEqual([]);
    expect(deletedUrls()).toEqual([`${GLOBAL_URL}/secrets/INFISICAL_A`]);
  });
});
