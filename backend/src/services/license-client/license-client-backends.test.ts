import { afterEach, describe, expect, test, vi } from "vitest";

import { licenseServerBackend } from "./license-client-backends";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("jsonwebtoken", () => ({
  default: { sign: () => "service-token" }
}));

const SERVER_URL = "https://license.example.com";
const ORG_ID = "org-1";

const mockFetchReturning = (body: unknown) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body
  })) as unknown as typeof fetch;

const readBody = (fetchMock: typeof fetch): Record<string, unknown> =>
  JSON.parse(vi.mocked(fetchMock).mock.calls[0][1]?.body as string) as Record<string, unknown>;

// Region is insert-only on the license server: it is read only by the call that creates the license,
// so every license-creating call has to carry this deployment's region or the org is recorded as "us".
describe("licenseServerBackend region on license-creating calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("buyProduct sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(readBody(fetchMock)).toMatchObject({ productId: "boost", plan: "pro", region: "eu" });
  });

  test("changeCommitments sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").changeCommitments(ORG_ID, {
      productId: "boost",
      dimensions: []
    });

    expect(readBody(fetchMock)).toMatchObject({ productId: "boost", region: "eu" });
  });

  test("startTrial sends the deployment region alongside the payload", async () => {
    const fetchMock = mockFetchReturning({ outcome: "trial_started" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key", "eu").startTrial(ORG_ID, {
      productKey: "boost",
      planKey: "pro"
    });

    expect(readBody(fetchMock)).toMatchObject({ product_key: "boost", plan_key: "pro", region: "eu" });
  });

  test("omits region entirely when the deployment has none configured", async () => {
    const fetchMock = mockFetchReturning({ outcome: "subscription_updated" });
    vi.stubGlobal("fetch", fetchMock);

    await licenseServerBackend(SERVER_URL, "key").buyProduct(ORG_ID, { productId: "boost", plan: "pro" });

    expect(readBody(fetchMock)).not.toHaveProperty("region");
  });
});
