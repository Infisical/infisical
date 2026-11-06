import Fastify, { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { initEnvConfig } from "@app/lib/config/env";
import { createSerializerCompiler } from "@app/server/lib/serializer-compiler";
import { validatorCompiler } from "@app/server/lib/validator-compiler";
import { fastifyErrHandler } from "@app/server/plugins/error-handler";
import { registerResponseSchemaHooks } from "@app/server/plugins/response-schema-hooks";

const SECRET = "sk_live_do_not_echo_me";

type TIssue = { code: string; path: (string | number)[]; message: string; errors?: TIssue[][] };
type TValidationBody = { reqId: string; statusCode: number; error: string; message: TIssue[] };

let app: FastifyInstance;

const post = async (url: string, payload?: unknown) => {
  const res = await app.inject({
    method: "POST",
    url,
    ...(payload === undefined ? {} : { payload: payload as object })
  });
  return { status: res.statusCode, raw: res.payload, body: res.json<TValidationBody>() };
};

beforeAll(async () => {
  const env: Record<string, string> = {
    DB_CONNECTION_URI: "postgres://infisical:infisical@localhost:5432/infisical",
    REDIS_URL: "redis://localhost:6379",
    AUTH_SECRET: "validation-error-body-test-secret",
    ENCRYPTION_KEY: "6c1fe4e407b8911c104518103505b218"
  };
  Object.entries(env).forEach(([name, value]) => {
    if (!process.env[name]) vi.stubEnv(name, value);
  });
  await initEnvConfig({} as never, {} as never);

  // Same wiring as server/app.ts: the 422 body goes through the route's DefaultResponseErrorsSchema[422].
  app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler as never);
  app.setSerializerCompiler(createSerializerCompiler({ legacyParseFallback: false }) as never);
  app.decorateRequest("realIp", "");
  app.decorateRequest("auth", null as never);
  await app.register(registerResponseSchemaHooks);
  await app.register(fastifyErrHandler as never);

  const ok = { response: { 200: z.object({ ok: z.boolean() }) } };
  const route = (url: string, body: z.ZodType, handler: () => unknown = () => ({ ok: true })) =>
    app.post(url, { schema: { body, ...ok } }, async () => handler());

  route(
    "/fields",
    z.object({
      name: z.string().min(1),
      kind: z.enum(["a", "b"]),
      count: z.number(),
      items: z.object({ name: z.string().max(2) }).array()
    })
  );
  route("/strict", z.object({ name: z.string() }).strict());
  route(
    "/custom",
    z
      .object({
        name: z.string().min(1, "Name is required"),
        flag: z.literal(false, { error: () => ({ message: "Not supported for X Connections" }) }).optional(),
        a: z.string(),
        b: z.string()
      })
      .refine((data) => data.a === data.b, { message: "a must equal b", path: ["b"] })
  );
  route("/secret", z.object({ kind: z.enum(["a", "b"]), value: z.string().max(4) }));
  route("/union", z.object({ v: z.union([z.string(), z.number()]) }));
  route(
    "/discriminated",
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("x"), a: z.string() }),
      z.object({ type: z.literal("y"), b: z.string() })
    ])
  );
  route("/service-throws", z.object({}), () => z.object({ id: z.string().guid() }).parse({ id: "nope" }));
  app.post(
    "/bad-response",
    { schema: { response: { 200: z.object({ id: z.string() }) } } },
    async () => ({ id: 1 }) as never
  );
  await app.ready();
});

afterAll(async () => {
  await app?.close();
});

describe("422 ValidationFailure body", () => {
  test("keeps the envelope the frontend's TApiErrors reads: { reqId, statusCode, error, message: issue[] }", async () => {
    const { status, body } = await post("/fields", { kind: "a", count: 1, items: [] });

    expect(status).toBe(422);
    expect(Object.keys(body).sort()).toEqual(["error", "message", "reqId", "statusCode"]);
    expect(body).toMatchObject({ statusCode: 422, error: "ValidationFailure" });
    expect(typeof body.reqId).toBe("string");
    expect(Array.isArray(body.message)).toBe(true);
    body.message.forEach((issue) => {
      expect(typeof issue.code).toBe("string");
      expect(typeof issue.message).toBe("string");
      expect(Array.isArray(issue.path)).toBe(true);
    });
  });

  test("keeps numeric array indices in issue paths (formatValidationErrorPath depends on them)", async () => {
    const { body } = await post("/fields", {
      name: "x",
      kind: "a",
      count: 1,
      items: [{ name: "ok" }, { name: "long" }]
    });

    expect(body.message.map((issue) => issue.path)).toEqual([["items", 1, "name"]]);
  });

  test("pins Zod's default messages the Validation Error modal shows", async () => {
    const { body } = await post("/fields", { name: "", kind: "c", count: "1", items: [] });

    expect(body.message.map(({ path, code, message }) => ({ path, code, message }))).toEqual([
      { path: ["name"], code: "too_small", message: "Too small: expected string to have >=1 characters" },
      { path: ["kind"], code: "invalid_value", message: 'Invalid option: expected one of "a"|"b"' },
      { path: ["count"], code: "invalid_type", message: "Invalid input: expected number, received string" }
    ]);

    const missing = await post("/fields", { kind: "a", count: 1, items: [] });
    expect(missing.body.message).toEqual([
      expect.objectContaining({
        path: ["name"],
        code: "invalid_type",
        message: "Invalid input: expected string, received undefined"
      })
    ]);
  });

  test("reports an unrecognized key on a strict object at the object's path", async () => {
    const { body } = await post("/strict", { name: "x", extra: 1 });

    expect(body.message).toEqual([
      expect.objectContaining({
        path: [],
        code: "unrecognized_keys",
        keys: ["extra"],
        message: 'Unrecognized key: "extra"'
      })
    ]);
  });

  test("passes custom messages through verbatim", async () => {
    const { body } = await post("/custom", { name: "", flag: true, a: "1", b: "2" });

    expect(body.message.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ["name"], message: "Name is required" },
      { path: ["flag"], message: "Not supported for X Connections" }
    ]);

    const refined = await post("/custom", { name: "n", a: "1", b: "2" });
    expect(refined.body.message.map(({ path, code, message }) => ({ path, code, message }))).toEqual([
      { path: ["b"], code: "custom", message: "a must equal b" }
    ]);
  });

  test("never echoes the submitted value back", async () => {
    const { status, raw } = await post("/secret", { kind: SECRET, value: SECRET });

    expect(status).toBe(422);
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('"input"');
  });

  test("reports a failed union once at the union's path, with each option's issues nested under errors", async () => {
    const { body } = await post("/union", { v: true });

    expect(body.message).toHaveLength(1);
    expect(body.message[0]).toMatchObject({ path: ["v"], code: "invalid_union", message: "Invalid input" });
    expect(body.message[0].errors?.map((option) => option.map((issue) => issue.path))).toEqual([[[]], [[]]]);
  });

  test("names the accepted discriminator values", async () => {
    const { body } = await post("/discriminated", { type: "z" });

    expect(body.message).toEqual([
      expect.objectContaining({
        path: ["type"],
        code: "invalid_union",
        message: "Invalid discriminator value. Expected 'x' | 'y'"
      })
    ]);
  });

  test("answers a ZodError thrown inside a handler with the same 422 envelope", async () => {
    const { status, body } = await post("/service-throws", {});

    expect(status).toBe(422);
    expect(body).toMatchObject({ statusCode: 422, error: "ValidationFailure" });
    expect(body.message).toEqual([
      expect.objectContaining({ path: ["id"], code: "invalid_format", message: "Invalid GUID" })
    ]);
  });

  test("answers a response that fails its schema with an opaque 500", async () => {
    const res = await app.inject({ method: "POST", url: "/bad-response" });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      statusCode: 500,
      error: "InternalServerError",
      message: "Something went wrong"
    });
  });
});
