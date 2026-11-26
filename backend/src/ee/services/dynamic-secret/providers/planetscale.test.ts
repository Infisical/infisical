import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";

import { PlanetScaleProvider } from "./planetscale";

const { mockedGet, mockedPost, mockedDelete } = vi.hoisted(() => ({
  mockedGet: vi.fn<(url: string, config: object) => Promise<unknown>>(),
  mockedPost: vi.fn<(url: string, body: Record<string, unknown>, config: object) => Promise<unknown>>(),
  mockedDelete: vi.fn<(url: string, config: object) => Promise<unknown>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { get: mockedGet, post: mockedPost, delete: mockedDelete } }));

const inputs = {
  serviceTokenId: "token-id",
  serviceToken: "pscale_tkn_secret",
  organization: "acme",
  database: "app-db",
  branch: "main",
  role: "reader"
};

const BRANCH_URL = "https://api.planetscale.com/v1/organizations/acme/databases/app-db/branches/main";

const createArgs = (expireAt: number) => ({
  inputs,
  expireAt,
  identity: { name: "tester" },
  dynamicSecret: { name: "planetscale-prod", type: "planetscale" } as TDynamicSecrets,
  metadata: { projectId: "proj-1" }
});

const upstreamError = (status: number, data: unknown = { code: "error", message: "Upstream failure" }) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as never
  });

describe("PlanetScaleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("create requests a password that expires with the lease and returns its credentials", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { id: "pw-1", username: "user1", plain_text: "pscale_pw_1", access_host_url: "aws.connect.psdb.cloud" }
    } as AxiosResponse);

    const result = await PlanetScaleProvider().create(createArgs(Date.now() + 3_600_000));

    const [url, body, config] = mockedPost.mock.calls[0];
    expect(url).toBe(`${BRANCH_URL}/passwords`);
    expect(body).toMatchObject({ role: "reader", ttl: 3600 });
    expect(config).toMatchObject({
      headers: { Authorization: "token-id:pscale_tkn_secret" },
      "axios-retry": { retries: 0 }
    });
    expect(result).toEqual({
      entityId: "pw-1",
      data: { DB_HOST: "aws.connect.psdb.cloud", DB_USERNAME: "user1", DB_PASSWORD: "pscale_pw_1" }
    });
  });

  test("create names a missing or inaccessible branch instead of PlanetScale's bare not found", async () => {
    mockedPost.mockRejectedValueOnce(upstreamError(404, { code: "not_found", message: "Not Found" }));

    await expect(PlanetScaleProvider().create(createArgs(Date.now() + 60_000))).rejects.toThrow(
      "PlanetScale couldn't find branch 'main' of database 'app-db' in organization 'acme'"
    );
  });

  test("revoke deletes the password", async () => {
    mockedDelete.mockResolvedValueOnce({} as AxiosResponse);

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).resolves.toEqual({
      entityId: "pw-1"
    });
    expect(mockedDelete.mock.calls[0][0]).toBe(`${BRANCH_URL}/passwords/pw-1`);
  });

  test("validateConnection accepts a Vitess branch and rejects a Postgres one", async () => {
    mockedGet.mockResolvedValueOnce({ data: { kind: "mysql" } } as AxiosResponse);
    await expect(PlanetScaleProvider().validateConnection(inputs, { projectId: "proj-1" })).resolves.toBe(true);
    expect(mockedGet.mock.calls[0][0]).toBe(BRANCH_URL);

    mockedGet.mockResolvedValueOnce({ data: { kind: "postgresql" } } as AxiosResponse);
    await expect(PlanetScaleProvider().validateConnection(inputs, { projectId: "proj-1" })).rejects.toThrow(
      "PlanetScale database 'app-db' isn't a Vitess database"
    );
  });

  test("revoke treats a password already deleted in PlanetScale as revoked", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(404));
    mockedGet.mockRejectedValueOnce(upstreamError(404)).mockResolvedValueOnce({ data: {} } as AxiosResponse);

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).resolves.toEqual({
      entityId: "pw-1"
    });
    expect(mockedGet.mock.calls[1][0]).toBe(BRANCH_URL);
  });

  test("revoke fails when the token can no longer see the branch", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(404));
    mockedGet.mockRejectedValueOnce(upstreamError(404)).mockRejectedValueOnce(upstreamError(404));

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).rejects.toThrow(
      "Failed to delete PlanetScale password: PlanetScale couldn't find branch 'main'"
    );
  });

  test("revoke treats an expired password as revoked", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(404));
    mockedGet.mockResolvedValueOnce({ data: { expired: true, deleted_at: null } } as AxiosResponse);

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).resolves.toEqual({
      entityId: "pw-1"
    });
  });

  test("revoke fails when the password still works but the token can't delete it", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(404));
    mockedGet.mockResolvedValueOnce({ data: { expired: false, deleted_at: null } } as AxiosResponse);

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).rejects.toThrow(
      "Grant it the delete_branch_password permission"
    );
  });

  test("revoke fails on other PlanetScale errors so the lease is retried", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(429, { code: "rate_limited", message: "Too many requests" }));

    await expect(PlanetScaleProvider().revoke(inputs, "pw-1", { projectId: "proj-1" })).rejects.toThrow(
      "Failed to delete PlanetScale password: Too many requests"
    );
    expect(mockedGet).not.toHaveBeenCalled();
  });

  test("rejects moving the dynamic secret to another branch while it has active leases", async () => {
    await expect(
      PlanetScaleProvider().validateProviderInputs(
        { ...inputs, branch: "dev" },
        { projectId: "proj-1", previousInputs: inputs, hasActiveLeases: true }
      )
    ).rejects.toThrow("The branch can't be changed while this dynamic secret has active leases");

    await expect(
      PlanetScaleProvider().validateProviderInputs(
        { ...inputs, role: "admin" },
        { projectId: "proj-1", previousInputs: inputs, hasActiveLeases: true }
      )
    ).resolves.toMatchObject({ role: "admin" });
  });
});
