import Fastify, { FastifyInstance } from "fastify";
import { vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PermissionBoundaryError } from "@app/lib/errors";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerExternalGroupOrgRoleMappingRouter } from "./external-group-org-role-mapping-router";

// The audit event records what the service accepted, so the handler has to settle the service call
// before writing it. Returning the pending promise instead still produces the right response, which
// is why this is pinned at the route: the service tests cannot see the ordering.

const ORG_ID = "org-id";
const URL = "/api/v1/scim/group-org-role-mappings";
const refused = () => new PermissionBoundaryError({ message: "Failed to map group 'g' to role 'admin'" });

const buildServer = async ({ list, update }: { list: () => Promise<unknown>; update: () => Promise<unknown> }) => {
  const createAuditLog = vi.fn().mockResolvedValue(undefined);

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate("services", {
    externalGroupOrgRoleMapping: {
      listExternalGroupOrgRoleMappings: vi.fn().mockImplementation(list),
      updateExternalGroupOrgRoleMappings: vi.fn().mockImplementation(update)
    },
    auditLog: { createAuditLog }
  } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, {
      auth: { authMode: AuthMode.JWT },
      permission: { orgId: ORG_ID },
      auditLogInfo: {}
    });
  });

  await app.register(registerExternalGroupOrgRoleMappingRouter as never, { prefix: URL });
  await app.ready();

  return { app, createAuditLog };
};

const auditedTypes = (createAuditLog: ReturnType<typeof vi.fn>) =>
  createAuditLog.mock.calls.map(([arg]) => (arg as { event: { type: EventType } }).event.type);

describe("external group org role mapping routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  test("a refused update is not audited", async () => {
    const server = await buildServer({ list: async () => [], update: async () => Promise.reject(refused()) });
    app = server.app;

    const res = await app.inject({
      method: "PUT",
      url: URL,
      body: { mappings: [{ groupName: "g", roleSlug: "admin" }] }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(server.createAuditLog).not.toHaveBeenCalled();
  });

  test("an accepted update is audited once, after the service settles", async () => {
    const order: string[] = [];
    const server = await buildServer({
      list: async () => [],
      update: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
        order.push("service");
        return [];
      }
    });
    app = server.app;
    server.createAuditLog.mockImplementation(async () => {
      order.push("audit");
    });

    const res = await app.inject({
      method: "PUT",
      url: URL,
      body: { mappings: [{ groupName: "g", roleSlug: "no-access" }] }
    });

    expect(res.statusCode).toBe(200);
    expect(auditedTypes(server.createAuditLog)).toEqual([EventType.UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS]);
    expect(order).toEqual(["service", "audit"]);
  });

  test("a refused read is not audited", async () => {
    const server = await buildServer({ list: async () => Promise.reject(refused()), update: async () => [] });
    app = server.app;

    const res = await app.inject({ method: "GET", url: URL });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(server.createAuditLog).not.toHaveBeenCalled();
  });

  test("an accepted read is audited once", async () => {
    const server = await buildServer({ list: async () => [], update: async () => [] });
    app = server.app;

    const res = await app.inject({ method: "GET", url: URL });

    expect(res.statusCode).toBe(200);
    expect(auditedTypes(server.createAuditLog)).toEqual([EventType.GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS]);
  });
});
