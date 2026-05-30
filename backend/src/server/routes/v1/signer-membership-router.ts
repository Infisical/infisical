import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SignerMemberKind } from "@app/services/signer-membership";

const SignerIdParamsSchema = z.object({ signerId: z.string().uuid() });

const SignerMemberSchema = z.object({
  membershipId: z.string().uuid(),
  signerId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  actorIdentityId: z.string().uuid().nullable().optional(),
  actorGroupId: z.string().uuid().nullable().optional(),
  role: z.string(),
  customRoleId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  details: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      authMethod: z.string().nullable().optional(),
      slug: z.string().nullable().optional()
    })
    .nullable()
    .optional()
});

const EffectiveSignerMemberSchema = z.object({
  actorUserId: z.string().uuid().nullable(),
  actorIdentityId: z.string().uuid().nullable(),
  role: z.string(),
  viaGroupIds: z.array(z.string().uuid()),
  isDirect: z.boolean(),
  details: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      authMethod: z.string().nullable().optional()
    })
    .nullable()
});

const RoleBodySchema = z.object({ role: z.string().min(1) });

const AddUsersBodySchema = z
  .object({
    userIds: z.string().uuid().array().default([]),
    emails: z
      .string()
      .email()
      .array()
      .default([])
      .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
    role: z.string().min(1).default("operator")
  })
  .refine((val) => val.userIds.length + val.emails.length > 0, {
    message: "Provide at least one userId or email."
  });

const AddUsersResponseSchema = z.object({
  memberships: z.array(SignerMemberSchema),
  skipped: z.array(z.string()),
  unresolved: z.array(z.string())
});

export const registerSignerMembershipRoutes = async (server: FastifyZodProvider) => {
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
      body: AddUsersBodySchema,
      response: { 200: AddUsersResponseSchema }
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
      response: { 200: z.object({ membershipId: z.string().uuid(), signerId: z.string().uuid() }) }
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
      body: z.object({ identityId: z.string().uuid(), role: z.string().min(1).default("operator") }),
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
      response: { 200: z.object({ membershipId: z.string().uuid(), signerId: z.string().uuid() }) }
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
      body: z.object({ groupId: z.string().uuid(), role: z.string().min(1).default("operator") }),
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
      response: { 200: z.object({ membershipId: z.string().uuid(), signerId: z.string().uuid() }) }
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

  server.route({
    method: "GET",
    url: "/:signerId/effective-users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerEffectiveUserMembers",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "List users that can act on this signer either directly or via a group that's a signer member. Role is the highest the user holds across all paths.",
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

  server.route({
    method: "GET",
    url: "/:signerId/members",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerMembers",
      tags: [ApiDocsTags.PkiSigners],
      description: "List all members on a signer (users, identities, and groups combined).",
      params: SignerIdParamsSchema,
      response: { 200: z.object({ memberships: z.array(SignerMemberSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const memberships = await server.services.signerMembership.listMembers({
        signerId: req.params.signerId,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/members",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addSignerMember",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Add a member to a signer. Provide exactly one of `userId`, `identityId`, or `groupId` together with the desired `role`.",
      params: SignerIdParamsSchema,
      body: z
        .object({
          userId: z.string().uuid().optional(),
          identityId: z.string().uuid().optional(),
          groupId: z.string().uuid().optional(),
          role: z.string().min(1)
        })
        .refine(
          (b) => [b.userId, b.identityId, b.groupId].filter(Boolean).length === 1,
          "Provide exactly one of userId, identityId, or groupId."
        ),
      response: { 200: SignerMemberSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const membership = await server.services.signerMembership.addMember({
        signerId: req.params.signerId,
        userId: req.body.userId,
        identityId: req.body.identityId,
        groupId: req.body.groupId,
        role: req.body.role,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      // eslint-disable-next-line no-nested-ternary
      const memberKind = req.body.userId
        ? SignerMemberKind.User
        : req.body.identityId
          ? SignerMemberKind.Identity
          : SignerMemberKind.Group;
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.ADD_PKI_SIGNER_MEMBER,
          metadata: {
            signerId: req.params.signerId,
            kind: memberKind,
            role: req.body.role,
            userIds: req.body.userId ? [req.body.userId] : undefined,
            identityId: req.body.identityId,
            groupId: req.body.groupId
          }
        }
      });

      return membership;
    }
  });

  const MembershipParamsSchema = z.object({
    signerId: z.string().uuid(),
    membershipId: z.string().uuid()
  });

  server.route({
    method: "PATCH",
    url: "/:signerId/members/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerMemberRole",
      tags: [ApiDocsTags.PkiSigners],
      description: "Change a member's role on a signer.",
      params: MembershipParamsSchema,
      body: RoleBodySchema,
      response: { 200: SignerMemberSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { kind, memberId } = await server.services.signerMembership.resolveMembership({
        signerId: req.params.signerId,
        membershipId: req.params.membershipId,
        projectId
      });
      const membership = await server.services.signerMembership.updateMemberRole({
        signerId: req.params.signerId,
        kind,
        memberId,
        role: req.body.role,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_PKI_SIGNER_MEMBER,
          metadata: { signerId: req.params.signerId, kind, memberId, role: req.body.role }
        }
      });

      return membership;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:signerId/members/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removeSignerMember",
      tags: [ApiDocsTags.PkiSigners],
      description: "Remove a member from a signer.",
      params: MembershipParamsSchema,
      response: {
        200: z.object({ membershipId: z.string().uuid(), signerId: z.string().uuid() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { kind, memberId } = await server.services.signerMembership.resolveMembership({
        signerId: req.params.signerId,
        membershipId: req.params.membershipId,
        projectId
      });
      const result = await server.services.signerMembership.removeMember({
        signerId: req.params.signerId,
        kind,
        memberId,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_PKI_SIGNER_MEMBER,
          metadata: { signerId: req.params.signerId, kind, memberId }
        }
      });

      return { membershipId: result.membershipId, signerId: result.signerId };
    }
  });
};
