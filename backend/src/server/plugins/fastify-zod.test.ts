import Fastify from "fastify";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { fastJsonSerializerCompiler, serializerCompiler, validatorCompiler, ZodTypeProvider } from "./fastify-zod";

const responseSchema = z.object({
  secrets: z
    .object({
      id: z.string(),
      secretValue: z.string(),
      reminderNote: z.string().nullable().optional(),
      skipMultilineEncoding: z.boolean().default(false).nullable().optional(),
      createdAt: z.date(),
      tags: z.object({ id: z.string(), slug: z.string() }).array().optional()
    })
    .array(),
  imports: z.object({ secretPath: z.string() }).array().optional()
});

const handlerData = {
  secrets: [
    {
      id: "a",
      secretValue: "v1",
      reminderNote: null,
      createdAt: new Date("2026-10-30T13:00:00.000Z"),
      tags: [{ id: "t1", slug: "prod", color: "#fff" }],
      encryptedValue: Buffer.from("must not leak"),
      userId: "u1"
    },
    { id: "b", secretValue: "v2", skipMultilineEncoding: true, createdAt: new Date("2026-10-30T13:01:00.000Z") }
  ],
  imports: [],
  internalFlag: true
};

const buildServer = () => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get("/zod", { schema: { response: { 200: responseSchema } } }, async () => handlerData as never);
  app.get(
    "/fast",
    { serializerCompiler: fastJsonSerializerCompiler, schema: { response: { 200: responseSchema } } },
    async () => handlerData as never
  );
  app.get(
    "/fast-not-found",
    {
      serializerCompiler: fastJsonSerializerCompiler,
      schema: { response: { 200: responseSchema, 404: z.object({ message: z.string() }) } }
    },
    async (_, reply) => reply.code(404).send({ message: "not found", stack: "internal" } as never)
  );
  return app;
};

type TBody = { secrets: { tags?: unknown[]; createdAt: string }[] };

describe("fastJsonSerializerCompiler", () => {
  test("produces the same body as the zod serializer, dropping fields the schema does not list", async () => {
    const app = buildServer();
    const [zodRes, fastRes] = await Promise.all([app.inject("/zod"), app.inject("/fast")]);

    expect(fastRes.statusCode).toBe(200);
    expect(fastRes.json()).toEqual(zodRes.json());
    expect(fastRes.body).not.toContain("must not leak");
    expect(fastRes.body).not.toContain("internalFlag");
    const [firstSecret] = fastRes.json<TBody>().secrets;
    expect(firstSecret.tags).toEqual([{ id: "t1", slug: "prod" }]);
    expect(firstSecret.createdAt).toBe("2026-10-30T13:00:00.000Z");
  });

  test("leaves non-2xx responses on the zod serializer", async () => {
    const app = buildServer();
    const res = await app.inject("/fast-not-found");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: "not found" });
  });
});
