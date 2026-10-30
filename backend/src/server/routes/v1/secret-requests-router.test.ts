import Fastify, { FastifyInstance } from "fastify";
import { vi } from "vitest";

import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerSecretRequestsRouter } from "./secret-requests-router";

const URL = "/api/v1/shared-secrets/requests";
const REQUEST_ID = "6f1c2c1e-6c55-4b39-9a39-2f3c8a1d9b7e";

const buildServer = async () => {
  const sendPostHogEvents = vi.fn().mockResolvedValue(undefined);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("services", {
    secretSharing: {
      createSecretRequest: vi.fn().mockResolvedValue({ id: REQUEST_ID }),
      deleteSharedSecretById: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        type: "request",
        accessType: "organization",
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    auditLog: { createAuditLog: vi.fn().mockResolvedValue(undefined) },
    telemetry: { sendPostHogEvents }
  } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, {
      auth: { authMode: AuthMode.JWT },
      permission: { orgId: "org-id", id: "user-id" },
      auditLogInfo: {}
    });
  });

  await app.register(registerSecretRequestsRouter as never, { prefix: URL });
  await app.ready();

  return { app, sendPostHogEvents };
};

describe("secret request routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test.each([
    ["created", { method: "POST", url: URL, body: { expiresIn: "1d" } }],
    ["deleted", { method: "DELETE", url: `${URL}/${REQUEST_ID}` }]
  ] as const)("a %s secret request's id is not sent to analytics", async (_, request) => {
    const server = await buildServer();
    app = server.app;

    const res = await app.inject(request);

    expect(res.statusCode).toBe(200);
    expect(server.sendPostHogEvents).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(server.sendPostHogEvents.mock.calls)).not.toContain(REQUEST_ID);
  });
});
