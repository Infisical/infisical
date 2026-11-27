import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_RATE_LIMITS, RateLimitConfiguration } from "@app/server/config/rateLimiter";

import { injectRateLimits } from "./inject-rate-limits";

type TRequestOptions = {
  planRateLimits?: Record<string, number>;
  planSlug?: string | null;
  orgId?: string;
};

const injectedFor = async ({ planRateLimits, planSlug = null, orgId = "org-1" }: TRequestOptions) => {
  const app = Fastify({ logger: false });
  const getPlan = vi.fn().mockResolvedValue({ rateLimits: planRateLimits, slug: planSlug });
  app.decorate("services", { licenseService: { getPlan } } as never);
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

describe("injectRateLimits plan slug", () => {
  test("carries the slug of the organization's plan", async () => {
    expect((await injectedFor({ planRateLimits: {}, planSlug: "pro" })).planSlug).toBe("pro");
  });

  test("is null for a plan without a slug and for a request without an organization", async () => {
    expect((await injectedFor({ planRateLimits: {} })).planSlug).toBeNull();
    expect((await injectedFor({ orgId: "", planSlug: "pro" })).planSlug).toBeNull();
  });
});
