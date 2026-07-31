import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createSelfHostedTokenProvider } from "./license-token-provider";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const SERVER_URL = "https://license.example.com";
const LICENSE_KEY = "infisical_lk_test";

// Build a JWT-shaped string ("header.payload.sig") whose payload carries the given exp (unix seconds).
const makeJwt = (expSeconds: number | null): string => {
  const payload = expSeconds === null ? {} : { exp: expSeconds };
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const mockFetchReturning = (token: string) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ token })
  })) as unknown as typeof fetch;

describe("createSelfHostedTokenProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("exchanges once and serves the cached token until near expiry", async () => {
    const fetchMock = mockFetchReturning(makeJwt(nowSeconds() + 3600));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createSelfHostedTokenProvider(LICENSE_KEY, { serverUrl: SERVER_URL });

    const first = await provider.getToken();
    const second = await provider.getToken();

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Posts the key to the token endpoint as X-API-KEY.
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(`${SERVER_URL}/api/auth/v1/license-login`);
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe(LICENSE_KEY);
  });

  test("re-exchanges after invalidate()", async () => {
    const fetchMock = mockFetchReturning(makeJwt(nowSeconds() + 3600));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createSelfHostedTokenProvider(LICENSE_KEY, { serverUrl: SERVER_URL });

    await provider.getToken();
    provider.invalidate();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("re-exchanges when the cached token is within the expiry margin", async () => {
    // exp only 30s out (< 60s margin), so every read is treated as expired.
    const fetchMock = mockFetchReturning(makeJwt(nowSeconds() + 30));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createSelfHostedTokenProvider(LICENSE_KEY, { serverUrl: SERVER_URL });

    await provider.getToken();
    await provider.getToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("single-flights concurrent exchanges", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<{ token: string }> }) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const provider = createSelfHostedTokenProvider(LICENSE_KEY, { serverUrl: SERVER_URL });

    const token = makeJwt(nowSeconds() + 3600);
    const [a, b] = await Promise.all([
      (async () => {
        const p = provider.getToken();
        resolveFetch({ ok: true, json: async () => ({ token }) });
        return p;
      })(),
      provider.getToken()
    ]);

    expect(a).toBe(token);
    expect(b).toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws when the token endpoint returns an error", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized"
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const provider = createSelfHostedTokenProvider(LICENSE_KEY, { serverUrl: SERVER_URL });

    await expect(provider.getToken()).rejects.toThrow(/token exchange failed/);
  });
});
