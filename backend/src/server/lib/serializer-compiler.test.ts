import { ZodTypeProvider } from "@fastify/type-provider-zod";
import Fastify from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { bidirectionalTransform } from "@app/lib/zod";

import { createSerializerCompiler } from "./serializer-compiler";
import { validatorCompiler } from "./validator-compiler";

const { warn, recordFallback } = vi.hoisted(() => ({ warn: vi.fn(), recordFallback: vi.fn() }));

vi.mock("@app/lib/logger", () => ({ logger: { warn } }));
vi.mock("@app/lib/telemetry/metrics", () => ({ recordResponseSerializationFallbackMetric: recordFallback }));

const IdentitySchema = z.object({
  id: z.string(),
  name: bidirectionalTransform(z.string(), (name) => name.trim()),
  hasDeleteProtection: z.boolean().default(false)
});

const respondWith = async (legacyParseFallback: boolean, payload: unknown) => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(createSerializerCompiler({ legacyParseFallback }));
  app.get(
    "/identities/:identityId",
    { schema: { response: { 200: z.object({ identity: IdentitySchema }) } } },
    async () => payload as never
  );
  const res = await app.inject({ method: "GET", url: "/identities/abc" });
  await app.close();
  return res;
};

describe("createSerializerCompiler", () => {
  afterEach(() => {
    warn.mockClear();
    recordFallback.mockClear();
  });

  test("encodes a response that matches its schema, without falling back", async () => {
    const res = await respondWith(true, { identity: { id: "i", name: " a ", hasDeleteProtection: true } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ identity: { id: "i", name: "a", hasDeleteProtection: true } });
    expect(warn).not.toHaveBeenCalled();
    expect(recordFallback).not.toHaveBeenCalled();
  });

  test("fills a missing defaulted field through the fallback, as Zod 3 did", async () => {
    const res = await respondWith(true, { identity: { id: "i", name: " a " } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ identity: { id: "i", name: "a", hasDeleteProtection: false } });
  });

  test("reports each fallback with the route template and the offending field", async () => {
    await respondWith(true, { identity: { id: "i", name: "a" } });

    expect(recordFallback).toHaveBeenCalledWith({ method: "GET", route: "/identities/:identityId" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("[route=/identities/:identityId]");
    expect(warn.mock.calls[0][0]).toContain("identity.hasDeleteProtection (invalid_type)");
  });

  test("does not put response values in the log line", async () => {
    await respondWith(true, { identity: { id: "secret-identity-id", name: "secret-name" } });

    expect(warn.mock.calls[0][0]).not.toContain("secret-");
  });

  test("still strips fields the schema does not describe", async () => {
    const res = await respondWith(true, { identity: { id: "i", name: "a", encryptedKey: "leak" } });

    expect(res.json()).toEqual({ identity: { id: "i", name: "a", hasDeleteProtection: false } });
  });

  test("fails with a 500 when the response is invalid either way", async () => {
    const res = await respondWith(true, { identity: { id: 1, name: "a" } });

    expect(res.statusCode).toBe(500);
    expect(warn).not.toHaveBeenCalled();
    expect(recordFallback).not.toHaveBeenCalled();
  });

  test("fails with a 500 instead of falling back when the fallback is off", async () => {
    const res = await respondWith(false, { identity: { id: "i", name: "a" } });

    expect(res.statusCode).toBe(500);
    expect(warn).not.toHaveBeenCalled();
  });
});
