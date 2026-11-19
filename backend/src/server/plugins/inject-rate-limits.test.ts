import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { DEFAULT_RATE_LIMITS, RateLimitConfiguration } from "@app/server/config/rateLimiter";

import { injectRateLimits } from "./inject-rate-limits";

const config = vi.hoisted(() => ({ SECRETS_ORG_RATE_LIMIT_OFFSET: 25, SECRETS_ACTOR_RATE_LIMIT_OFFSET: 10 }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

const rateLimitsFor = async ({
  planRateLimits,
  orgId = "org-1"
}: {
  planRateLimits?: Record<string, number>;
  orgId?: string;
}): Promise<RateLimitConfiguration> => {
  const app = Fastify({ logger: false });
  const getPlan = vi.fn().mockResolvedValue({ rateLimits: planRateLimits });
  app.decorate("services", { licenseService: { getPlan } } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, { auth: orgId ? { orgId, rootOrgId: orgId } : undefined });
  });
  await app.register(injectRateLimits);
  app.get("/", async (req) => req.rateLimits);

  const res = await app.inject({ method: "GET", url: "/" });
  await app.close();
  return res.json<RateLimitConfiguration>();
};

describe("injectRateLimits secretsOrgLimit", () => {
  test("uses the organization limit the plan sets", async () => {
    const limits = await rateLimitsFor({ planRateLimits: { secretsLimit: 300, secretsOrgLimit: 5000 } });
    expect(limits.secretsOrgLimit).toBe(5000);
  });

  test("falls back to the plan's secrets limit plus SECRETS_ORG_RATE_LIMIT_OFFSET when the plan sets no organization limit", async () => {
    const limits = await rateLimitsFor({ planRateLimits: { secretsLimit: 300 } });
    expect(limits.secretsOrgLimit).toBe(325);
  });

  test("falls back to the default secrets limit plus SECRETS_ORG_RATE_LIMIT_OFFSET when the plan sets neither", async () => {
    const limits = await rateLimitsFor({ planRateLimits: {} });
    expect(limits.secretsOrgLimit).toBe(DEFAULT_RATE_LIMITS.secretsLimit + 25);
  });

  test("uses the default secrets limit plus SECRETS_ORG_RATE_LIMIT_OFFSET for a request without an organization", async () => {
    const limits = await rateLimitsFor({ orgId: "" });
    expect(limits.secretsOrgLimit).toBe(DEFAULT_RATE_LIMITS.secretsLimit + 25);
  });
});

describe("injectRateLimits secretsActorLimit", () => {
  test("uses the actor limit the plan sets", async () => {
    const limits = await rateLimitsFor({ planRateLimits: { secretsLimit: 300, secretsActorLimit: 700 } });
    expect(limits.secretsActorLimit).toBe(700);
  });

  test("falls back to the plan's secrets limit plus SECRETS_ACTOR_RATE_LIMIT_OFFSET when the plan sets no actor limit", async () => {
    const limits = await rateLimitsFor({ planRateLimits: { secretsLimit: 300 } });
    expect(limits.secretsActorLimit).toBe(310);
  });

  test("falls back to the default secrets limit plus SECRETS_ACTOR_RATE_LIMIT_OFFSET when the plan sets neither", async () => {
    const limits = await rateLimitsFor({ planRateLimits: {} });
    expect(limits.secretsActorLimit).toBe(DEFAULT_RATE_LIMITS.secretsLimit + 10);
  });

  test("uses the default secrets limit plus SECRETS_ACTOR_RATE_LIMIT_OFFSET for a request without an organization", async () => {
    const limits = await rateLimitsFor({ orgId: "" });
    expect(limits.secretsActorLimit).toBe(DEFAULT_RATE_LIMITS.secretsLimit + 10);
  });
});
