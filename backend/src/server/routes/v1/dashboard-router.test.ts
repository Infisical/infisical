import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { fastifyErrHandler } from "@app/server/plugins/error-handler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { registerDashboardRouter } from "./dashboard-router";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({
    OTEL_TELEMETRY_COLLECTION_ENABLED: false
  })
}));

vi.mock("@app/server/plugins/auth/verify-auth", () => ({
  verifyAuth: () => async (req: FastifyRequest) => {
    req.permission = {
      id: "test-user-id",
      type: ActorType.USER,
      orgId: "test-org-id",
      parentOrgId: "test-org-id",
      rootOrgId: "test-org-id",
      authMethod: AuthMethod.EMAIL
    };
    req.auth = { actor: ActorType.USER, user: { username: "test-user" } } as never;
    req.auditLogInfo = {} as never;
  }
}));

describe("Dashboard Router - secrets-by-keys real-route regression", () => {
  const buildApp = async () => {
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const getSecretsRaw = vi.fn().mockResolvedValue({ secrets: [] });
    const createAuditLog = vi.fn().mockResolvedValue({});
    const sendPostHogEvents = vi.fn().mockResolvedValue({});

    app.decorate("services", {
      secret: { getSecretsRaw },
      auditLog: { createAuditLog },
      telemetry: { sendPostHogEvents }
    } as never);

    await app.register(fastifyErrHandler);
    await app.register(registerDashboardRouter);
    await app.ready();

    return { app, getSecretsRaw };
  };

  test("preserves literal percent characters in secret keys without double-decoding or throwing 400", async () => {
    const { app, getSecretsRaw } = await buildApp();

    // Query keys containing literal percent: PAY%RATE, KEY%25, KEY%2FNAME
    // When sent by standard clients/Axios, % is URL-encoded once as %25
    const res = await app.inject({
      method: "GET",
      url: "/secrets-by-keys?projectId=test-proj&environment=dev&keys=PAY%25RATE,KEY%2525,KEY%252FNAME"
    });

    expect(res.statusCode).toBe(200);
    expect(getSecretsRaw).toHaveBeenCalledTimes(1);
    expect(getSecretsRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-proj",
        environment: "dev",
        keys: ["PAY%RATE", "KEY%25", "KEY%2FNAME"]
      })
    );

    await app.close();
  });

  test("handles standard keys separated by commas", async () => {
    const { app, getSecretsRaw } = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/secrets-by-keys?projectId=test-proj&environment=dev&keys=KEY_A,KEY_B"
    });

    expect(res.statusCode).toBe(200);
    expect(getSecretsRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        keys: ["KEY_A", "KEY_B"]
      })
    );

    await app.close();
  });

  test("returns 400 when keys query parameter is empty", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/secrets-by-keys?projectId=test-proj&environment=dev&keys="
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error?: string; message?: string };
    expect(body.error).toBe("BadRequest");
    expect(body.message).toBe("One or more keys required");

    await app.close();
  });

  test("returns 400 with descriptive error when safeDecodeURIComponent encounters malformed percent encoding", async () => {
    const { app } = await buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/secrets-overview?projectId=test-proj&environments=dev&tags=%2"
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error?: string; message?: string };
    expect(body.error).toBe("BadRequest");
    expect(body.message).toBe("Malformed URL encoding in query parameters");

    await app.close();
  });
});
