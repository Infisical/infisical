import { AxiosError, AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { CloudflareAccessProvider } from "./cloudflare-access";

const { mockedPost, mockedDelete } = vi.hoisted(() => ({
  mockedPost: vi.fn<(url: string, body: Record<string, unknown>, config: { headers: object }) => Promise<unknown>>(),
  mockedDelete: vi.fn<(url: string, config: { headers: object }) => Promise<unknown>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { get: vi.fn(), post: mockedPost, delete: mockedDelete } }));

const API_TOKEN = "cf-api-token-value-0123456789";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const OTHER_ACCOUNT_ID = "fedcba9876543210fedcba9876543210";
const tokensUrl = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/service_tokens`;
const TOKEN_ID = "f174e90a-fafe-4643-bbbc-4a0ed4fc8415";

const inputs = {
  apiToken: API_TOKEN,
  accountId: ACCOUNT_ID,
  tags: [
    { key: "issuer", value: "infisical" },
    { key: "pool", value: "orbs" }
  ]
};

const createArgs = (expireAt: number) => ({
  inputs,
  expireAt,
  identity: { name: "tester" },
  dynamicSecret: { name: "agent-vault-proxy", type: "cloudflare-access" } as TDynamicSecrets,
  metadata: { projectId: "proj-1" }
});

const upstreamError = (status: number, data: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as never
  });

describe("CloudflareAccessProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("create asks for a token that lasts until the lease expires, with the tags, and returns its credentials", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-23T10:00:00.000Z"));
    mockedPost.mockResolvedValueOnce({
      data: { success: true, result: { id: TOKEN_ID, client_id: "cid.access", client_secret: "csecret" } }
    } as AxiosResponse);

    const result = await CloudflareAccessProvider().create(createArgs(Date.parse("2026-11-23T11:30:00.000Z")));

    const [url, body, config] = mockedPost.mock.calls[0];
    expect(url).toBe(tokensUrl(ACCOUNT_ID));
    expect(body).toMatchObject({ duration: "5400s", tags: { issuer: "infisical", pool: "orbs" } });
    expect(body.name).toMatch(/^infisical-[a-zA-Z0-9]{16}$/);
    expect(config.headers).toMatchObject({ Authorization: `Bearer ${API_TOKEN}` });
    expect(config).toMatchObject({ "axios-retry": { retries: 0 } });
    expect(result).toEqual({
      entityId: `${ACCOUNT_ID}/${TOKEN_ID}`,
      data: { CLIENT_ID: "cid.access", CLIENT_SECRET: "csecret", TOKEN_ID, TOKEN_NAME: body.name }
    });
  });

  test("create surfaces Cloudflare's error messages and never the API token", async () => {
    mockedPost.mockRejectedValueOnce(
      upstreamError(403, { errors: [{ code: 10000, message: `Authentication error for ${API_TOKEN}` }] })
    );

    const promise = CloudflareAccessProvider().create(createArgs(Date.now() + 60_000));

    await expect(promise).rejects.toThrow(BadRequestError);
    await expect(promise).rejects.toThrow("Authentication error for [REDACTED] (10000)");
    await expect(promise).rejects.toSatisfy((err: Error) => !err.message.includes(API_TOKEN));
  });

  test("revoke deletes the token in the account it was created in, even after the account ID changes", async () => {
    mockedDelete.mockResolvedValueOnce({ data: { success: true } } as AxiosResponse);
    const entityId = `${OTHER_ACCOUNT_ID}/${TOKEN_ID}`;

    await expect(CloudflareAccessProvider().revoke(inputs, entityId, { projectId: "proj-1" })).resolves.toEqual({
      entityId
    });
    expect(mockedDelete.mock.calls[0][0]).toBe(`${tokensUrl(OTHER_ACCOUNT_ID)}/${TOKEN_ID}`);
    expect(mockedDelete.mock.calls[0][1].headers).toMatchObject({ Authorization: `Bearer ${API_TOKEN}` });
  });

  test("revoke treats a token Cloudflare no longer has as revoked, and fails on other errors", async () => {
    const entityId = `${ACCOUNT_ID}/${TOKEN_ID}`;

    mockedDelete.mockRejectedValueOnce(upstreamError(404, { errors: [{ message: "not found" }] }));
    await expect(CloudflareAccessProvider().revoke(inputs, entityId, { projectId: "proj-1" })).resolves.toEqual({
      entityId
    });
    expect(mockedDelete.mock.calls[0][0]).toBe(`${tokensUrl(ACCOUNT_ID)}/${TOKEN_ID}`);

    mockedDelete.mockRejectedValueOnce(upstreamError(403, { errors: [{ message: "forbidden" }] }));
    await expect(CloudflareAccessProvider().revoke(inputs, entityId, { projectId: "proj-1" })).rejects.toThrow(
      /Failed to delete Cloudflare Access service token: forbidden/
    );
  });

  test("revoke rejects an entity ID without an account", async () => {
    await expect(CloudflareAccessProvider().revoke(inputs, TOKEN_ID, { projectId: "proj-1" })).rejects.toThrow(
      BadRequestError
    );
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  test("tags must fit Cloudflare's limits", async () => {
    const provider = CloudflareAccessProvider();
    const sixTags = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, value: "v" }));

    await expect(
      provider.validateProviderInputs({ ...inputs, tags: sixTags }, { projectId: "proj-1" })
    ).rejects.toThrow(/at most 5 tags/);
    await expect(
      provider.validateProviderInputs(
        { ...inputs, tags: [{ key: "team name", value: "payments" }] },
        { projectId: "proj-1" }
      )
    ).rejects.toThrow(/Tag keys may only contain/);
    await expect(
      provider.validateProviderInputs({ ...inputs, tags: [{ key: "pool", value: "a,b" }] }, { projectId: "proj-1" })
    ).rejects.toThrow(/Tag values can't contain commas/);
    await expect(
      provider.validateProviderInputs(
        { ...inputs, tags: [{ key: "équipe.v-1_a", value: "a b" }] },
        { projectId: "proj-1" }
      )
    ).resolves.toMatchObject({ tags: [{ key: "équipe.v-1_a", value: "a b" }] });
  });
});
