import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SignerMemberKind } from "@app/services/signer-membership";

import {
  EffectiveSignerMemberSchema,
  RemoveSignerMemberResponseSchema,
  RoleBodySchema,
  SignerIdParamsSchema,
  SignerMemberSchema,
  SignerRoleSchema
} from "./schemas";

export const registerSignerUserMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:signerId/users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerUserMembers",
      tags: [ApiDocsTags.PkiSigners],
      description: "List user members of a signer",
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
        kind: SignerMemberKind.User
      });
      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/users",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addSignerUserMembers",
      tags: [ApiDocsTags.PkiSigners],
      description: "Add user members to a signer",
      params: SignerIdParamsSchema,
      body: z
        .object({
          userIds: z.string().uuid().array().default([]),
          emails: z
            .string()
            .email()
            .array()
            .default([])
            .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
          role: SignerRoleSchema.default("operator")
        })
        .refine((val) => val.userIds.length + val.emails.length > 0, {
          message: "Provide at least one userId or email."
        }),
      response: {
        200: z.object({
          memberships: z.array(SignerMemberSchema),
          skipped: z.array(z.string()),
          unresolved: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signerMembership.addUserMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        userIds: req.body.userIds,
        emails: req.body.emails,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ADD_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.User,
            role: req.body.role,
            added: result.memberships.length,
            userIds: result.memberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id))
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:signerId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerUserRole",
      tags: [ApiDocsTags.PkiSigners],
      description: "Update a user member's role on a signer",
      params: z.object({ signerId: z.string().uuid(), userId: z.string().uuid() }),
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
        kind: SignerMemberKind.User,
        memberId: req.params.userId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.User,
            memberId: req.params.userId,
            role: req.body.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:signerId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeSignerUserMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Remove a user from a signer",
      params: z.object({ signerId: z.string().uuid(), userId: z.string().uuid() }),
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
        kind: SignerMemberKind.User,
        memberId: req.params.userId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_SIGNER_MEMBER,
          metadata: { signerId: req.params.signerId, kind: SignerMemberKind.User, memberId: req.params.userId }
        }
      });

      return { membershipId: result.membershipId, signerId: result.signerId };
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/effective-users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerEffectiveUserMembers",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "List users that can act on this signer either through a direct membership or through a group that's a signer member.",
      params: SignerIdParamsSchema,
      response: { 200: z.object({ members: z.array(EffectiveSignerMemberSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const members = await server.services.signerMembership.listEffectiveMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        signerId: req.params.signerId,
        kind: "user"
      });
      return { members };
    }
  });
};
