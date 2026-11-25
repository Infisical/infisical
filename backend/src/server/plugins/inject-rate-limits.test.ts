import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_RATE_LIMITS, RateLimitConfiguration } from "@app/server/config/rateLimiter";

import { injectRateLimits } from "./inject-rate-limits";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

type TLastKnownPlan = { plan: { rateLimits: Record<string, number>; slug?: string | null }; fetchedAt: number };

type TRequestOptions = {
  planRateLimits?: Record<string, number>;
  planSlug?: string | null;
  orgId?: string;
  isFallback?: boolean;
  getLastKnownPlan?: () => Promise<TLastKnownPlan | null>;
};

const injectedFor = async ({
  planRateLimits,
  planSlug = null,
  orgId = "org-1",
  isFallback = false,
  getLastKnownPlan = vi.fn().mockResolvedValue(null)
}: TRequestOptions) => {
  const app = Fastify({ logger: false });
  const getPlan = vi.fn().mockResolvedValue({ rateLimits: planRateLimits, slug: planSlug, isFallback });
  app.decorate("services", { licenseService: { getPlan, getLastKnownPlan } } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, { auth: orgId ? { orgId, rootOrgId: orgId } : undefined });
  });
  await app.register(injectRateLimits);
  app.get("/", async (req) => ({ rateLimits: req.rateLimits, planSlug: req.rateLimitPlanSlug }));

  const res = await app.inject({ method: "GET", url: "/" });
  await app.close();
  return res.json<{ rateLimits: RateLimitConfiguration; planSlug: string | null }>();
};

const rateLimitsFor = async (options: TRequestOptions) => (await injectedFor(options)).rateLimits;

describe("injectRateLimits", () => {
  test("uses the limits the organization's plan sets", async () => {
    const limits = await rateLimitsFor({ planRateLimits: { readLimit: 900, writeLimit: 800, secretsLimit: 300 } });
    expect(limits).toMatchObject({ readLimit: 900, writeLimit: 800, secretsLimit: 300 });
  });

  test("uses the default limits for a plan that sets none and for a request without an organization", async () => {
    expect(await rateLimitsFor({ planRateLimits: {} })).toEqual(DEFAULT_RATE_LIMITS);
    expect(await rateLimitsFor({ orgId: "" })).toEqual(DEFAULT_RATE_LIMITS);
  });
});

describe("injectRateLimits on a fallback plan", () => {
  const fallback = { planRateLimits: { secretsLimit: 40 }, isFallback: true };

  test("uses the limits of the organization's last known plan", async () => {
    const limits = await rateLimitsFor({
      ...fallback,
      getLastKnownPlan: async () => ({
        plan: { rateLimits: { readLimit: 900, writeLimit: 800, secretsLimit: 1000 } },
        fetchedAt: Date.now()
      })
    });
    expect(limits).toMatchObject({
      readLimit: 900,
      writeLimit: 800,
      secretsLimit: 1000
    });
  });

  test("keeps the fallback plan's limits when no last known plan is cached", async () => {
    const limits = await rateLimitsFor(fallback);
    expect(limits).toMatchObject({ secretsLimit: 40 });
  });

  test("keeps the fallback plan's limits when the last known plan cannot be read", async () => {
    const limits = await rateLimitsFor({
      ...fallback,
      getLastKnownPlan: async () => {
        throw new Error("key store unavailable");
      }
    });
    expect(limits).toMatchObject({ secretsLimit: 40 });
  });

  test("does not read the last known plan for a plan that is not a fallback", async () => {
    const getLastKnownPlan = vi.fn().mockResolvedValue(null);
    await rateLimitsFor({ planRateLimits: { secretsLimit: 300 }, getLastKnownPlan });
    expect(getLastKnownPlan).not.toHaveBeenCalled();
  });
});

describe("injectRateLimits plan slug", () => {
  test("carries the slug of the organization's plan", async () => {
    expect((await injectedFor({ planRateLimits: {}, planSlug: "pro" })).planSlug).toBe("pro");
  });

  test("is null for a plan without a slug and for a request without an organization", async () => {
    expect((await injectedFor({ planRateLimits: {} })).planSlug).toBeNull();
    expect((await injectedFor({ orgId: "", planSlug: "pro" })).planSlug).toBeNull();
  });

  test("carries the slug of the last known plan while the plan is a fallback", async () => {
    const { planSlug } = await injectedFor({
      planRateLimits: {},
      isFallback: true,
      getLastKnownPlan: async () => ({ plan: { rateLimits: {}, slug: "enterprise" }, fetchedAt: Date.now() })
    });
    expect(planSlug).toBe("enterprise");
  });
});
