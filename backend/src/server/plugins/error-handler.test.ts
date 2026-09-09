import Fastify from "fastify";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { safeDecodeURIComponent } from "@app/server/lib/schemas";

import { fastifyErrHandler } from "./error-handler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./fastify-zod";

describe("fastifyErrHandler - URIError and safe query decoding", () => {
  const buildApp = async () => {
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fastifyErrHandler);

    app.route({
      method: "GET",
      url: "/test-dashboard-query",
      schema: {
        querystring: z.object({
          tags: z.string().trim().transform(safeDecodeURIComponent).optional(),
          environments: z.string().trim().transform(safeDecodeURIComponent).optional()
        }),
        response: {
          200: z.object({
            tags: z.string().optional(),
            environments: z.string().optional()
          })
        }
      },
      handler: async (req) => ({ tags: req.query.tags, environments: req.query.environments })
    });

    app.route({
      method: "GET",
      url: "/test-raw-urierror",
      handler: async () => {
        throw new URIError("URI malformed");
      }
    });

    await app.ready();
    return app;
  };

  test("returns 400 Bad Request instead of 500 when query parameter has malformed percent encoding", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test-dashboard-query?tags=%2"
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error?: string; message?: string };
    expect(body.error).toBe("BadRequest");
    expect(body.message).toBe("Malformed URL encoding in query parameters");
    await app.close();
  });

  test("parses standard comma-separated query parameters correctly", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test-dashboard-query?environments=dev,staging"
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { environments?: string };
    expect(body.environments).toBe("dev,staging");
    await app.close();
  });

  test("parses percent-encoded comma parameters without requiring double encoding", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test-dashboard-query?environments=dev%2Cstaging"
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { environments?: string };
    expect(body.environments).toBe("dev,staging");
    await app.close();
  });

  test("maps unhandled URIError to 400 Bad Request instead of 500", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/test-raw-urierror"
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error?: string; message?: string };
    expect(body.error).toBe("BadRequest");
    expect(body.message).toBe("Malformed URL encoding in query parameters");
    await app.close();
  });
});
