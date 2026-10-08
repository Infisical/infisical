import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { fastifyRequestContext } from "@fastify/request-context";
import Fastify, { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { ActorType } from "@app/services/auth/auth-type";

import { injectPermissionDeniedAuditLog } from "./audit-log-permission-denied";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "./fastify-zod";

const ORG_ID = "org-1";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

const deny = () => ForbiddenError.from(createMongoAbility([])).throwUnlessCan("read", "Thing");

const buildServer = async () => {
  const recordPermissionDenied = vi.fn().mockResolvedValue(undefined);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fastifyRequestContext);

  app.decorate("services", { auditLog: { recordPermissionDenied } } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, {
      auth: { authMode: "jwt" },
      permission: { orgId: ORG_ID },
      auditLogInfo: { actor: { type: ActorType.USER, metadata: { userId: "user-1" } }, orgId: ORG_ID }
    });
  });
  await app.register(injectPermissionDeniedAuditLog);

  app.route({ method: "PUT", url: "/org-settings", handler: async () => deny() });
  app.route({
    method: "PUT",
    url: "/org-settings-with-query",
    schema: { querystring: z.object({ page: z.coerce.number().optional() }) },
    handler: async () => deny()
  });
  app.route({
    method: "GET",
    url: "/things",
    schema: { querystring: z.object({ projectId: z.string() }) },
    handler: async () => deny()
  });
  app.route({
    method: "GET",
    url: "/projects/:projectId/things",
    schema: { params: z.object({ projectId: z.string() }) },
    handler: async () => deny()
  });

  await app.ready();
  return { app, recordPermissionDenied };
};

const recordedProjectId = (recordPermissionDenied: ReturnType<typeof vi.fn>) =>
  (recordPermissionDenied.mock.calls[0][0] as { projectId?: string }).projectId;

describe("permission denied audit hook", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test("ignores a projectId in the query when the route declares no querystring schema", async () => {
    const server = await buildServer();
    app = server.app;

    await app.inject({ method: "PUT", url: "/org-settings?projectId=unused" });

    expect(server.recordPermissionDenied).toHaveBeenCalledTimes(1);
    expect(recordedProjectId(server.recordPermissionDenied)).toBeUndefined();
  });

  test("ignores a projectId the declared querystring schema does not include", async () => {
    const server = await buildServer();
    app = server.app;

    await app.inject({ method: "PUT", url: "/org-settings-with-query?projectId=unused&page=1" });

    expect(server.recordPermissionDenied).toHaveBeenCalledTimes(1);
    expect(recordedProjectId(server.recordPermissionDenied)).toBeUndefined();
  });

  test("uses a projectId the route declares in its querystring", async () => {
    const server = await buildServer();
    app = server.app;

    await app.inject({ method: "GET", url: `/things?projectId=${PROJECT_ID}` });

    expect(recordedProjectId(server.recordPermissionDenied)).toBe(PROJECT_ID);
  });

  test("uses a projectId from the route params", async () => {
    const server = await buildServer();
    app = server.app;

    await app.inject({ method: "GET", url: `/projects/${PROJECT_ID}/things` });

    expect(recordedProjectId(server.recordPermissionDenied)).toBe(PROJECT_ID);
  });
});
