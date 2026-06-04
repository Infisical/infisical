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

export const registerSignerIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:signerId/identities",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerIdentityMembers",
      tags: [ApiDocsTags.PkiSigners],
      description: "List machine identity members of a signer",
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
        kind: SignerMemberKind.Identity
      });
      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/identities",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addSignerIdentityMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Add a machine identity to a signer",
      params: SignerIdParamsSchema,
      body: z.object({ identityId: z.string().uuid(), role: SignerRoleSchema.default("operator") }),
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
        identityId: req.body.identityId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ADD_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.Identity,
            role: req.body.role,
            identityId: req.body.identityId
          }
        }
      });

      return membership;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:signerId/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerIdentityRole",
      tags: [ApiDocsTags.PkiSigners],
      description: "Update a machine identity's role on a signer",
      params: z.object({ signerId: z.string().uuid(), identityId: z.string().uuid() }),
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
        kind: SignerMemberKind.Identity,
        memberId: req.params.identityId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: SignerMemberKind.Identity,
            memberId: req.params.identityId,
            role: req.body.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:signerId/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeSignerIdentityMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Remove a machine identity from a signer",
      params: z.object({ signerId: z.string().uuid(), identityId: z.string().uuid() }),
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
        kind: SignerMemberKind.Identity,
        memberId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_SIGNER_MEMBER,
          metadata: { signerId: req.params.signerId, kind: SignerMemberKind.Identity, memberId: req.params.identityId }
        }
      });

      return { membershipId: result.membershipId, signerId: result.signerId };
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/effective-identities",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerEffectiveIdentityMembers",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "List machine identities that can act on this signer either directly or via a group that's a signer member.",
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
        kind: "identity"
      });
      return { members };
    }
  });
};
