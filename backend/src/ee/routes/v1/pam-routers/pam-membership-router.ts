import { FastifyRequest } from "fastify";
import z from "zod";

import { EventType, TCreateAuditLogDTO } from "@app/ee/services/audit-log/audit-log-types";
import { PamProductRole, PamResourceRole } from "@app/ee/services/pam/pam-enums";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
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
  expiresAt: z.date().nullable().optional(),
  createdAt: z.date()
});

const MemberResultSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  identityId: z.string().uuid().optional(),
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
    projectId: req.internalPamProjectId,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    event: { type, metadata } as TCreateAuditLogDTO["event"]
  });
};

const emitTelemetry = (
  server: FastifyZodProvider,
  req: FastifyRequest & { permission: { orgId: string } },
  event: PostHogEventTypes,
  properties: Record<string, unknown> = {}
) => {
  void server.services.telemetry.sendPostHogEvents({
    event,
    distinctId: getTelemetryDistinctId(req),
    organizationId: req.permission.orgId,
    properties: { orgId: req.permission.orgId, ...properties }
  } as Parameters<typeof server.services.telemetry.sendPostHogEvents>[0]);
};

export const registerPamProductMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/capabilities",
    schema: {
      operationId: "getPamAccessCapabilities",
      description: "Get the current user's PAM management capabilities",
      tags: [ApiDocsTags.PamMemberships],
      response: {
        200: z.object({
          isProductAdmin: z.boolean(),
          isResourceAdmin: z.boolean(),
          canViewSessions: z.boolean(),
          canViewAuditLogs: z.boolean()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamMembership.getAccessCapabilities(actorCtx(req));
    }
  });

  server.route({
    method: "GET",
    url: "/users",
    schema: {
      operationId: "listPamProductMembers",
      description: "List user members of the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listProductMembers(actorCtx(req));
      return { members: all.filter((m) => m.userId) };
    }
  });

  server.route({
    method: "GET",
    url: "/groups",
    schema: {
      operationId: "listPamProductGroupMembers",
      description: "List group members of the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listProductMembers(actorCtx(req));
      return { members: all.filter((m) => m.groupId) };
    }
  });

  server.route({
    method: "POST",
    url: "/users",
    schema: {
      operationId: "addPamProductUserMembers",
      description: "Add users to the PAM product by userId or email",
      tags: [ApiDocsTags.PamMemberships],
      body: z
        .object({
          userIds: z.string().uuid().array().default([]).describe("User IDs to add"),
          emails: z
            .string()
            .email()
            .array()
            .default([])
            .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase")
            .describe("User emails to resolve and add"),
          role: z.nativeEnum(PamProductRole).describe("The role to assign")
        })
        .refine((val) => val.userIds.length + val.emails.length > 0, {
          message: "Provide at least one userId or email."
        }),
      response: {
        200: z.object({
          memberships: z.array(MemberResultSchema),
          skipped: z.array(z.string()),
          unresolved: z.array(z.string())
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pamMembership.addProductUserMembers({
        ...actorCtx(req),
        userIds: req.body.userIds,
        emails: req.body.emails,
        role: req.body.role
      });

      for (const m of result.memberships) {
        // eslint-disable-next-line no-await-in-loop
        await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_ADD, {
          userId: m.userId,
          role: m.role
        });
        emitTelemetry(server, req, PostHogEventTypes.PamProductMemberAdded);
      }

      return result;
    }
  });

  server.route({
    method: "PATCH",
    url: "/users/:userId",
    schema: {
      operationId: "updatePamProductUserMemberRole",
      description: "Update a PAM product user member's role",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ userId: z.string().uuid().describe("The ID of the user") }),
      body: z.object({ role: z.nativeEnum(PamProductRole).describe("The role to assign") }),
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
      description: "Remove a user from the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ userId: z.string().uuid().describe("The ID of the user") }),
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
      description: "Add a group to the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({ role: z.nativeEnum(PamProductRole).describe("The role to assign") }),
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
      description: "Update a PAM product group member's role",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({ role: z.nativeEnum(PamProductRole).describe("The role to assign") }),
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
      description: "Remove a group from the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ groupId: z.string().uuid().describe("The ID of the group") }),
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

  server.route({
    method: "GET",
    url: "/identities",
    schema: {
      operationId: "listPamProductIdentityMembers",
      description: "List identity members of the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listProductMembers(actorCtx(req));
      return { members: all.filter((m) => m.identityId) };
    }
  });

  server.route({
    method: "POST",
    url: "/identities/:identityId",
    schema: {
      operationId: "addPamProductIdentityMember",
      description: "Add an identity to the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({ role: z.nativeEnum(PamProductRole).describe("The role to assign") }),
      response: { 200: MemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addProductMember({
        ...actorCtx(req),
        identityId: req.params.identityId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_ADD, {
        identityId: req.params.identityId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberAdded);

      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    schema: {
      operationId: "updatePamProductIdentityMemberRole",
      description: "Update a PAM product identity member's role",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({ role: z.nativeEnum(PamProductRole).describe("The role to assign") }),
      response: { 200: MemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateProductMemberRole({
        ...actorCtx(req),
        identityId: req.params.identityId,
        role: req.body.role
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_UPDATE, {
        identityId: req.params.identityId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberUpdated);

      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    schema: {
      operationId: "removePamProductIdentityMember",
      description: "Remove an identity from the PAM product",
      tags: [ApiDocsTags.PamMemberships],
      params: z.object({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      response: { 200: MemberResultSchema.pick({ membershipId: true, identityId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeProductMember({
        ...actorCtx(req),
        identityId: req.params.identityId
      });

      await emitAuditLog(server, req, EventType.PAM_PRODUCT_MEMBER_REMOVE, { identityId: req.params.identityId });
      emitTelemetry(server, req, PostHogEventTypes.PamProductMemberRemoved);

      return membership;
    }
  });
};

export const registerPamFolderMembershipRouter = async (server: FastifyZodProvider) => {
  const FolderMemberResultSchema = MemberResultSchema.extend({ folderId: z.string().uuid() });
  const folderParam = z.object({ folderId: z.string().uuid().describe("The ID of the folder") });

  server.route({
    method: "GET",
    url: "/:folderId/users",
    schema: {
      operationId: "listPamFolderMembers",
      description: "List user members of a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listFolderMembers({
        ...actorCtx(req),
        folderId: req.params.folderId
      });
      return { members: all.filter((m) => m.userId) };
    }
  });

  server.route({
    method: "GET",
    url: "/:folderId/groups",
    schema: {
      operationId: "listPamFolderGroupMembers",
      description: "List group members of a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listFolderMembers({
        ...actorCtx(req),
        folderId: req.params.folderId
      });
      return { members: all.filter((m) => m.groupId) };
    }
  });

  server.route({
    method: "POST",
    url: "/:folderId/users/:userId",
    schema: {
      operationId: "addPamFolderUserMember",
      description: "Add a user to a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: FolderMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        userId: req.params.userId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_ADD, {
        folderId: req.params.folderId,
        userId: req.params.userId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberAdded, { expiry: req.body.expiry });
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId/users/:userId",
    schema: {
      operationId: "updatePamFolderUserMemberRole",
      description: "Update a user member's role in a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: FolderMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateFolderMemberRole({
        ...actorCtx(req),
        folderId: req.params.folderId,
        userId: req.params.userId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_UPDATE, {
        folderId: req.params.folderId,
        userId: req.params.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberUpdated);
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId/users/:userId",
    schema: {
      operationId: "removePamFolderUserMember",
      description: "Remove a user from a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      response: { 200: FolderMemberResultSchema.pick({ membershipId: true, folderId: true, userId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        userId: req.params.userId
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_REMOVE, {
        folderId: req.params.folderId,
        userId: req.params.userId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberRemoved);
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "POST",
    url: "/:folderId/groups/:groupId",
    schema: {
      operationId: "addPamFolderGroupMember",
      description: "Add a group to a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: FolderMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        groupId: req.params.groupId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_ADD, {
        folderId: req.params.folderId,
        groupId: req.params.groupId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberAdded, { expiry: req.body.expiry });
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId/groups/:groupId",
    schema: {
      operationId: "updatePamFolderGroupMemberRole",
      description: "Update a group member's role in a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: FolderMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateFolderMemberRole({
        ...actorCtx(req),
        folderId: req.params.folderId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_UPDATE, {
        folderId: req.params.folderId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberUpdated);
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId/groups/:groupId",
    schema: {
      operationId: "removePamFolderGroupMember",
      description: "Remove a group from a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      response: { 200: FolderMemberResultSchema.pick({ membershipId: true, folderId: true, groupId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        groupId: req.params.groupId
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_REMOVE, {
        folderId: req.params.folderId,
        groupId: req.params.groupId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberRemoved);
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "GET",
    url: "/:folderId/identities",
    schema: {
      operationId: "listPamFolderIdentityMembers",
      description: "List identity members of a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listFolderMembers({
        ...actorCtx(req),
        folderId: req.params.folderId
      });
      return { members: all.filter((m) => m.identityId) };
    }
  });

  server.route({
    method: "POST",
    url: "/:folderId/identities/:identityId",
    schema: {
      operationId: "addPamFolderIdentityMember",
      description: "Add an identity to a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: FolderMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        identityId: req.params.identityId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_ADD, {
        folderId: req.params.folderId,
        identityId: req.params.identityId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberAdded, { expiry: req.body.expiry });
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId/identities/:identityId",
    schema: {
      operationId: "updatePamFolderIdentityMemberRole",
      description: "Update an identity member's role in a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: FolderMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateFolderMemberRole({
        ...actorCtx(req),
        folderId: req.params.folderId,
        identityId: req.params.identityId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_UPDATE, {
        folderId: req.params.folderId,
        identityId: req.params.identityId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberUpdated);
      return { ...membership, folderId: req.params.folderId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId/identities/:identityId",
    schema: {
      operationId: "removePamFolderIdentityMember",
      description: "Remove an identity from a folder",
      tags: [ApiDocsTags.PamMemberships],
      params: folderParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      response: { 200: FolderMemberResultSchema.pick({ membershipId: true, folderId: true, identityId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeFolderMember({
        ...actorCtx(req),
        folderId: req.params.folderId,
        identityId: req.params.identityId
      });
      await emitAuditLog(server, req, EventType.PAM_FOLDER_MEMBER_REMOVE, {
        folderId: req.params.folderId,
        identityId: req.params.identityId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamFolderMemberRemoved);
      return { ...membership, folderId: req.params.folderId };
    }
  });
};

export const registerPamAccountMembershipRouter = async (server: FastifyZodProvider) => {
  const AccountMemberResultSchema = MemberResultSchema.extend({ accountId: z.string().uuid() });
  const accountParam = z.object({ accountId: z.string().uuid().describe("The ID of the account") });

  server.route({
    method: "GET",
    url: "/:accountId/users",
    schema: {
      operationId: "listPamAccountMembers",
      description: "List user members of an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listAccountMembers({
        ...actorCtx(req),
        accountId: req.params.accountId
      });
      return { members: all.filter((m) => m.userId) };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/groups",
    schema: {
      operationId: "listPamAccountGroupMembers",
      description: "List group members of an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listAccountMembers({
        ...actorCtx(req),
        accountId: req.params.accountId
      });
      return { members: all.filter((m) => m.groupId) };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/users/:userId",
    schema: {
      operationId: "addPamAccountUserMember",
      description: "Add a user to an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: AccountMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        userId: req.params.userId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_ADD, {
        accountId: req.params.accountId,
        userId: req.params.userId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberAdded, { expiry: req.body.expiry });
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId/users/:userId",
    schema: {
      operationId: "updatePamAccountUserMemberRole",
      description: "Update a user member's role in an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: AccountMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateAccountMemberRole({
        ...actorCtx(req),
        accountId: req.params.accountId,
        userId: req.params.userId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_UPDATE, {
        accountId: req.params.accountId,
        userId: req.params.userId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberUpdated);
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId/users/:userId",
    schema: {
      operationId: "removePamAccountUserMember",
      description: "Remove a user from an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ userId: z.string().uuid().describe("The ID of the user") }),
      response: { 200: AccountMemberResultSchema.pick({ membershipId: true, accountId: true, userId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        userId: req.params.userId
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_REMOVE, {
        accountId: req.params.accountId,
        userId: req.params.userId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberRemoved);
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/groups/:groupId",
    schema: {
      operationId: "addPamAccountGroupMember",
      description: "Add a group to an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: AccountMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        groupId: req.params.groupId,
        expiry: req.body.expiry,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_ADD, {
        accountId: req.params.accountId,
        groupId: req.params.groupId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberAdded, { expiry: req.body.expiry });
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId/groups/:groupId",
    schema: {
      operationId: "updatePamAccountGroupMemberRole",
      description: "Update a group member's role in an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: AccountMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateAccountMemberRole({
        ...actorCtx(req),
        accountId: req.params.accountId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_UPDATE, {
        accountId: req.params.accountId,
        groupId: req.params.groupId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberUpdated);
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId/groups/:groupId",
    schema: {
      operationId: "removePamAccountGroupMember",
      description: "Remove a group from an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ groupId: z.string().uuid().describe("The ID of the group") }),
      response: { 200: AccountMemberResultSchema.pick({ membershipId: true, accountId: true, groupId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        groupId: req.params.groupId
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_REMOVE, {
        accountId: req.params.accountId,
        groupId: req.params.groupId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberRemoved);
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/identities",
    schema: {
      operationId: "listPamAccountIdentityMembers",
      description: "List identity members of an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam,
      response: { 200: z.object({ members: z.array(MemberSchema) }) }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const all = await server.services.pamMembership.listAccountMembers({
        ...actorCtx(req),
        accountId: req.params.accountId
      });
      return { members: all.filter((m) => m.identityId) };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/identities/:identityId",
    schema: {
      operationId: "addPamAccountIdentityMember",
      description: "Add an identity to an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({
        role: z.nativeEnum(PamResourceRole).describe("The role to assign"),
        expiry: z
          .string()
          .nullable()
          .optional()
          .describe("Relative duration for temporary access (e.g. '1h', '7d'). Null for permanent.")
      }),
      response: { 200: AccountMemberResultSchema }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.addAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        identityId: req.params.identityId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_ADD, {
        accountId: req.params.accountId,
        identityId: req.params.identityId,
        role: req.body.role,
        expiry: req.body.expiry
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberAdded, { expiry: req.body.expiry });
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId/identities/:identityId",
    schema: {
      operationId: "updatePamAccountIdentityMemberRole",
      description: "Update an identity member's role in an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      body: z.object({ role: z.nativeEnum(PamResourceRole).describe("The role to assign") }),
      response: { 200: AccountMemberResultSchema.omit({ createdAt: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.updateAccountMemberRole({
        ...actorCtx(req),
        accountId: req.params.accountId,
        identityId: req.params.identityId,
        role: req.body.role
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_UPDATE, {
        accountId: req.params.accountId,
        identityId: req.params.identityId,
        role: req.body.role
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberUpdated);
      return { ...membership, accountId: req.params.accountId };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId/identities/:identityId",
    schema: {
      operationId: "removePamAccountIdentityMember",
      description: "Remove an identity from an account",
      tags: [ApiDocsTags.PamMemberships],
      params: accountParam.extend({ identityId: z.string().uuid().describe("The ID of the machine identity") }),
      response: { 200: AccountMemberResultSchema.pick({ membershipId: true, accountId: true, identityId: true }) }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pamMembership.removeAccountMember({
        ...actorCtx(req),
        accountId: req.params.accountId,
        identityId: req.params.identityId
      });
      await emitAuditLog(server, req, EventType.PAM_ACCOUNT_MEMBER_REMOVE, {
        accountId: req.params.accountId,
        identityId: req.params.identityId
      });
      emitTelemetry(server, req, PostHogEventTypes.PamAccountMemberRemoved);
      return { ...membership, accountId: req.params.accountId };
    }
  });
};
