import { FastifyRequest } from "fastify";
import z from "zod";

import { EventType, TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { PamProductRole, PamResourceRole } from "@app/ee/services/pam/pam-enums";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorAuthMethod, ActorType, AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  identityId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.date()
});

const MemberResultSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  role: z.string(),
  createdAt: z.date()
});

const actorCtx = (req: {
  internalPamProjectId: string;
  permission: { id: string; type: ActorType; orgId: string; authMethod: ActorAuthMethod };
}) => ({
  projectId: req.internalPamProjectId,
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

type ResourceMemberConfig = {
  scopeKey: "folderId" | "accountId";
  urlPrefix: string;
  operationPrefix: string;
  resultSchema: z.ZodObject<z.ZodRawShape>;
  listMembers: string;
  addMember: string;
  updateMemberRole: string;
  removeMember: string;
  events: {
    add: EventType;
    update: EventType;
    remove: EventType;
  };
  telemetry: {
    add: PostHogEventTypes;
    update: PostHogEventTypes;
    remove: PostHogEventTypes;
  };
};

const emitAuditLog = async (
  server: FastifyZodProvider,
  req: FastifyRequest & {
    auditLogInfo: Pick<TCreateAuditLogDTO, "userAgent" | "userAgentType" | "ipAddress" | "actor">;
    permission: { orgId: string };
  },
  type: EventType,
  metadata: Record<string, unknown>
) => {
  await server.services.auditLog.createAuditLog({
    ...req.auditLogInfo,
    orgId: req.permission.orgId,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    event: { type, metadata } as TCreateAuditLogDTO["event"]
  });
};

const emitTelemetry = (
  server: FastifyZodProvider,
  req: FastifyRequest & { permission: { orgId: string } },
  event: PostHogEventTypes
) => {
  void server.services.telemetry.sendPostHogEvents({
    event,
    distinctId: getTelemetryDistinctId(req),
    organizationId: req.permission.orgId,
    properties: { orgId: req.permission.orgId }
  } as Parameters<typeof server.services.telemetry.sendPostHogEvents>[0]);
};

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
const registerResourceMemberRoutes = (server: FastifyZodProvider, cfg: ResourceMemberConfig) => {
  const scopeParam = z.object({ [cfg.scopeKey]: z.string().uuid() });
  const svc: Record<string, (...args: any[]) => any> = server.services.pamMembership as never;

  server.route({
    method: "GET",
    url: `${cfg.urlPrefix}/users`,
    schema: {
      operationId: `list${cfg.operationPrefix}Members`,
      params: scopeParam,
      response: { 200: z.array(MemberSchema) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return svc[cfg.listMembers]({
        ...actorCtx(req),
        [cfg.scopeKey]: req.params[cfg.scopeKey]
      });
    }
  });

  server.route({
    method: "POST",
    url: `${cfg.urlPrefix}/users`,
    schema: {
      operationId: `add${cfg.operationPrefix}UserMember`,
      params: scopeParam,
      body: z.object({ userId: z.string().uuid(), role: z.nativeEnum(PamResourceRole) }),
      response: { 200: cfg.resultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.addMember]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        userId: req.body.userId,
        role: req.body.role
      });

      await emitAuditLog(server, req, cfg.events.add, {
        [cfg.scopeKey]: scopeId,
        userId: req.body.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, cfg.telemetry.add);
      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: `${cfg.urlPrefix}/users/:userId`,
    schema: {
      operationId: `update${cfg.operationPrefix}UserMemberRole`,
      params: scopeParam.extend({ userId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamResourceRole) }),
      response: { 200: cfg.resultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.updateMemberRole]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        userId: req.params.userId,
        role: req.body.role
      });
      await emitAuditLog(server, req, cfg.events.update, {
        [cfg.scopeKey]: scopeId,
        userId: req.params.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, cfg.telemetry.update);
      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: `${cfg.urlPrefix}/users/:userId`,
    schema: {
      operationId: `remove${cfg.operationPrefix}UserMember`,
      params: scopeParam.extend({ userId: z.string().uuid() }),
      response: {
        200: cfg.resultSchema.pick({ membershipId: true, [cfg.scopeKey]: true, userId: true } as Record<string, true>)
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.removeMember]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        userId: req.params.userId
      });
      await emitAuditLog(server, req, cfg.events.remove, { [cfg.scopeKey]: scopeId, userId: req.params.userId });
      emitTelemetry(server, req, cfg.telemetry.remove);
      return membership;
    }
  });

  server.route({
    method: "POST",
    url: `${cfg.urlPrefix}/groups/:groupId`,
    schema: {
      operationId: `add${cfg.operationPrefix}GroupMember`,
      params: scopeParam.extend({ groupId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamResourceRole) }),
      response: { 200: cfg.resultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.addMember]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      await emitAuditLog(server, req, cfg.events.add, {
        [cfg.scopeKey]: scopeId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, cfg.telemetry.add);
      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: `${cfg.urlPrefix}/groups/:groupId`,
    schema: {
      operationId: `update${cfg.operationPrefix}GroupMemberRole`,
      params: scopeParam.extend({ groupId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamResourceRole) }),
      response: { 200: cfg.resultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.updateMemberRole]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      await emitAuditLog(server, req, cfg.events.update, {
        [cfg.scopeKey]: scopeId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, cfg.telemetry.update);
      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: `${cfg.urlPrefix}/groups/:groupId`,
    schema: {
      operationId: `remove${cfg.operationPrefix}GroupMember`,
      params: scopeParam.extend({ groupId: z.string().uuid() }),
      response: {
        200: cfg.resultSchema.pick({ membershipId: true, [cfg.scopeKey]: true, groupId: true } as Record<string, true>)
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const scopeId = req.params[cfg.scopeKey];
      const membership = await svc[cfg.removeMember]({
        ...actorCtx(req),
        [cfg.scopeKey]: scopeId,
        groupId: req.params.groupId
      });
      await emitAuditLog(server, req, cfg.events.remove, { [cfg.scopeKey]: scopeId, groupId: req.params.groupId });
      emitTelemetry(server, req, cfg.telemetry.remove);
      return membership;
    }
  });
};
/* eslint-enable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */

export const registerPamMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/users",
    schema: {
      operationId: "listPamProductMembers",
      response: { 200: z.array(MemberSchema) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamMembership.listProductMembers(actorCtx(req));
    }
  });

  server.route({
    method: "POST",
    url: "/users",
    schema: {
      operationId: "addPamProductUserMember",
      body: z.object({ userId: z.string().uuid(), role: z.nativeEnum(PamProductRole) }),
      response: { 200: MemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addProductMember({
        ...actorCtx(req),
        userId: req.body.userId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_ADD, {
        userId: req.body.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberAdded);

      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: "/users/:userId",
    schema: {
      operationId: "updatePamProductUserMemberRole",
      params: z.object({ userId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamProductRole) }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateProductMemberRole({
        ...actorCtx(req),
        userId: req.params.userId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_UPDATE, {
        userId: req.params.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberUpdated);

      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: "/users/:userId",
    schema: {
      operationId: "removePamProductUserMember",
      params: z.object({ userId: z.string().uuid() }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, userId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeProductMember({
        ...actorCtx(req),
        userId: req.params.userId
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_REMOVE, { userId: req.params.userId });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberRemoved);

      return membership;
    }
  });

  server.route({
    method: "POST",
    url: "/groups/:groupId",
    schema: {
      operationId: "addPamProductGroupMember",
      params: z.object({ groupId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamProductRole) }),
      response: { 200: MemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addProductMember({
        ...actorCtx(req),
        groupId: req.params.groupId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_ADD, {
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberAdded);

      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: "/groups/:groupId",
    schema: {
      operationId: "updatePamProductGroupMemberRole",
      params: z.object({ groupId: z.string().uuid() }),
      body: z.object({ role: z.nativeEnum(PamProductRole) }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateProductMemberRole({
        ...actorCtx(req),
        groupId: req.params.groupId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_UPDATE, {
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberUpdated);

      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: "/groups/:groupId",
    schema: {
      operationId: "removePamProductGroupMember",
      params: z.object({ groupId: z.string().uuid() }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, groupId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeProductMember({
        ...actorCtx(req),
        groupId: req.params.groupId
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_REMOVE, { groupId: req.params.groupId });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberRemoved);

      return membership;
    }
  });

  const FolderMemberResultSchema = MemberResultSchema.extend({ folderId: z.string().uuid() });
  const AccountMemberResultSchema = MemberResultSchema.extend({ accountId: z.string().uuid() });

  registerResourceMemberRoutes(server, {
    scopeKey: "folderId",
    urlPrefix: "/folders/:folderId",
    operationPrefix: "PamFolder",
    resultSchema: FolderMemberResultSchema,
    listMembers: "listFolderMembers",
    addMember: "addFolderMember",
    updateMemberRole: "updateFolderMemberRole",
    removeMember: "removeFolderMember",
    events: {
      add: EventType.PAM_FOLDER_MEMBER_ADD,
      update: EventType.PAM_FOLDER_MEMBER_UPDATE,
      remove: EventType.PAM_FOLDER_MEMBER_REMOVE
    },
    telemetry: {
      add: PostHogEventTypes.PamFolderMemberAdded,
      update: PostHogEventTypes.PamFolderMemberUpdated,
      remove: PostHogEventTypes.PamFolderMemberRemoved
    }
  });

  registerResourceMemberRoutes(server, {
    scopeKey: "accountId",
    urlPrefix: "/accounts/:accountId",
    operationPrefix: "PamAccount",
    resultSchema: AccountMemberResultSchema,
    listMembers: "listAccountMembers",
    addMember: "addAccountMember",
    updateMemberRole: "updateAccountMemberRole",
    removeMember: "removeAccountMember",
    events: {
      add: EventType.PAM_ACCOUNT_MEMBER_ADD,
      update: EventType.PAM_ACCOUNT_MEMBER_UPDATE,
      remove: EventType.PAM_ACCOUNT_MEMBER_REMOVE
    },
    telemetry: {
      add: PostHogEventTypes.PamAccountMemberAdded,
      update: PostHogEventTypes.PamAccountMemberUpdated,
      remove: PostHogEventTypes.PamAccountMemberRemoved
    }
  });
};
