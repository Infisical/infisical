import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SignerMemberKind } from "@app/services/signer-membership";

import {
  RemoveSignerMemberResponseSchema,
  RoleBodySchema,
  SignerIdParamsSchema,
  SignerMemberSchema,
  SignerRoleSchema
} from "./schemas";

export const registerSignerGroupMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:signerId/groups",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerGroupMembers",
      tags: [ApiDocsTags.PkiSigners],
      description: "List group members of a signer",
      params: SignerIdParamsSchema,
      response: { 200: z.object({ memberships: z.array(SignerMemberSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.signerMembership.listMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        kind: SignerMemberKind.Group
      });
      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/groups",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addSignerGroupMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Add a group to a signer",
      params: SignerIdParamsSchema,
      body: z.object({ groupId: z.string().uuid(), role: SignerRoleSchema.default("operator") }),
      response: { 200: SignerMemberSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.signerMembership.addMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        groupId: req.body.groupId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ADD_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.Group,
            role: req.body.role,
            groupId: req.body.groupId
          }
        }
      });

      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:signerId/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerGroupRole",
      tags: [ApiDocsTags.PkiSigners],
      description: "Update a group's role on a signer",
      params: z.object({ signerId: z.string().uuid(), groupId: z.string().uuid() }),
      body: RoleBodySchema,
      response: { 200: z.object({ membership: SignerMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.signerMembership.updateMemberRole({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        kind: SignerMemberKind.Group,
        memberId: req.params.groupId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.Group,
            memberId: req.params.groupId,
            role: req.body.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:signerId/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeSignerGroupMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Remove a group from a signer",
      params: z.object({ signerId: z.string().uuid(), groupId: z.string().uuid() }),
      response: { 200: RemoveSignerMemberResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signerMembership.removeMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        kind: SignerMemberKind.Group,
        memberId: req.params.groupId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_SIGNER_MEMBER,
          metadata: { signerId: req.params.signerId, kind: SignerMemberKind.Group, memberId: req.params.groupId }
        }
      });

      return { membershipId: result.membershipId, signerId: result.signerId };
    }
  });
};
