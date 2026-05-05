import { z } from "zod";

import {
  AccessScope,
  GroupsSchema,
  IdentitiesSchema,
  IdentityProjectMembershipsSchema,
  ProjectMembershipRole,
  ProjectMembershipsSchema,
  ProjectRolesSchema,
  ProjectUserMembershipRolesSchema,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SanitizedRoleSchema, SanitizedUserSchema } from "../sanitizedSchemas";

const MembershipRoleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().optional().nullable(),
  customRoleName: z.string().optional().nullable(),
  customRoleSlug: z.string().optional().nullable(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().optional().nullable(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional()
});

const RolesUpdateBodySchema = z.object({
  roles: z
    .array(
      z.union([
        z.object({
          role: z.string(),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          role: z.string(),
          isTemporary: z.literal(true),
          temporaryMode: z.nativeEnum(TemporaryPermissionMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
      ])
    )
    .min(1)
    .refine((data) => data.some(({ isTemporary }) => !isTemporary), "At least one long lived role is required")
});

export const registerCertManagerAccessRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listCertManagerUsers",
      tags: [ApiDocsTags.PkiCertificates],
      description: "List Cert Manager users.",
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.extend({
            user: SanitizedUserSchema,
            roles: z.array(MembershipRoleSchema)
          })
            .omit({ updatedAt: true, projectId: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { data: memberships } = await server.services.membershipUser.listMemberships({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/users/:membershipId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getCertManagerUser",
      params: z.object({ membershipId: z.string().trim().min(1) }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema.extend({
            user: SanitizedUserSchema,
            roles: z.array(MembershipRoleSchema)
          }).omit({ updatedAt: true, projectId: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );
      const membership = await server.services.membershipUser.getMembershipByUserId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId }
      });
      return { membership: { ...membership, userId } };
    }
  });

  server.route({
    method: "POST",
    url: "/users",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "inviteCertManagerUsers",
      tags: [ApiDocsTags.PkiCertificates],
      description: "Invite users to Cert Manager.",
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase"),
        roleSlugs: z.string().array().min(1).optional()
      }),
      response: {
        200: z.object({ memberships: ProjectMembershipsSchema.omit({ projectId: true }).array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const usernamesAndEmails = [...req.body.emails, ...req.body.usernames];

      await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        data: { roles: [], usernames: usernamesAndEmails }
      });

      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          roles: (req.body.roleSlugs || [ProjectMembershipRole.Member]).map((role) => ({
            isTemporary: false,
            role
          })),
          usernames: usernamesAndEmails
        }
      });

      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_PROJECT_MEMBER,
          metadata: {
            members: memberships.map(({ actorUserId, id }) => ({
              userId: actorUserId || "",
              membershipId: id,
              email: ""
            }))
          }
        }
      });

      return {
        memberships: memberships.map((el) => ({ ...el, userId: el.actorUserId as string }))
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/users/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateCertManagerUser",
      params: z.object({ membershipId: z.string().trim().min(1) }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ roles: ProjectUserMembershipRolesSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );
      const { membership } = await server.services.membershipUser.updateMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId },
        data: { roles: req.body.roles }
      });
      return {
        roles: membership.roles.map((el) => ({ ...el, projectMembershipId: req.params.membershipId }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/users",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeCertManagerUsers",
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase")
      }),
      response: { 200: z.object({ memberships: ProjectMembershipsSchema.omit({ projectId: true }).array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const memberships = await server.services.projectMembership.deleteProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        emails: req.body.emails,
        usernames: req.body.usernames
      });
      await Promise.all(
        memberships.map((membership) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            projectId,
            event: {
              type: EventType.REMOVE_PROJECT_MEMBER,
              metadata: { userId: membership.actorUserId as string, email: "" }
            }
          })
        )
      );
      return {
        memberships: memberships.map((el) => ({ ...el, userId: el.actorUserId as string }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/users/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeCertManagerUser",
      params: z.object({ membershipId: z.string().trim().min(1) }),
      response: { 200: z.object({ membership: ProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { userId } = await server.services.convertor.userMembershipIdToUserId(
        req.params.membershipId,
        AccessScope.Project,
        req.permission.orgId
      );
      const { membership } = await server.services.membershipUser.deleteMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_PROJECT_MEMBER,
          metadata: { userId: membership.actorUserId as string, email: "" }
        }
      });
      return { membership: { ...membership, userId } };
    }
  });

  server.route({
    method: "GET",
    url: "/identities",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listCertManagerIdentities",
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).optional(),
        limit: z.coerce.number().min(1).max(1000).default(20).optional(),
        identityName: z.string().trim().optional(),
        roles: z
          .string()
          .transform((val) => val.split(",").map((role) => role.trim()))
          .optional()
      }),
      response: {
        200: z.object({
          identityMemberships: z
            .object({
              id: z.string(),
              identityId: z.string(),
              createdAt: z.date(),
              updatedAt: z.date(),
              roles: z.array(MembershipRoleSchema),
              identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true })
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { data: identityMemberships, totalCount } = await server.services.membershipIdentity.listMemberships({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          offset: req.query.offset,
          limit: req.query.limit,
          identityName: req.query.identityName,
          roles: req.query.roles
        }
      });
      return { identityMemberships, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/available",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAvailableCertManagerIdentities",
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).optional(),
        limit: z.coerce.number().min(1).max(1000).default(20).optional(),
        identityName: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          identities: IdentitiesSchema.pick({ id: true, name: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { identities } = await server.services.membershipIdentity.listAvailableIdentities({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          offset: req.query.offset,
          limit: req.query.limit,
          identityName: req.query.identityName
        }
      });
      return { identities };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getCertManagerIdentity",
      params: z.object({ identityId: z.string().trim().min(1) }),
      response: {
        200: z.object({
          identityMembership: z.object({
            id: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
            roles: z.array(MembershipRoleSchema),
            lastLoginAuthMethod: z.string().nullable().optional(),
            lastLoginTime: z.date().nullable().optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true }).extend({
              authMethods: z.array(z.string()),
              metadata: z
                .object({
                  id: z.string().trim().min(1),
                  key: z.string().trim().min(1),
                  value: z.string().trim().min(1)
                })
                .array()
                .optional()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const identityMembership = await server.services.membershipIdentity.getMembershipByIdentityId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { identityId: req.params.identityId }
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "POST",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "addCertManagerIdentity",
      params: z.object({ identityId: z.string().trim().min(1) }),
      body: z.object({
        role: z.string().trim().optional().default(ProjectMembershipRole.NoAccess),
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string(),
                isTemporary: z.literal(false).default(false)
              }),
              z.object({
                role: z.string(),
                isTemporary: z.literal(true),
                temporaryMode: z.nativeEnum(TemporaryPermissionMode),
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
                temporaryAccessStartTime: z.string().datetime()
              })
            ])
          )
          .optional()
      }),
      response: { 200: z.object({ identityMembership: IdentityProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { role, roles } = req.body;
      if (!role && !roles) {
        throw new BadRequestError({ message: "You must provide either role or roles field" });
      }
      const { membership } = await server.services.membershipIdentity.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          identityId: req.params.identityId,
          roles: roles || [{ role, isTemporary: false }]
        }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.CREATE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: { identityId: req.params.identityId, roles: req.body.roles }
        }
      });
      return { identityMembership: { ...membership, identityId: req.params.identityId } };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateCertManagerIdentity",
      params: z.object({ identityId: z.string().trim().min(1) }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ identityMembership: IdentityProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { membership } = await server.services.membershipIdentity.updateMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { identityId: req.params.identityId },
        data: { roles: req.body.roles }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.UPDATE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: { identityId: req.params.identityId, roles: req.body.roles }
        }
      });
      return { identityMembership: { ...membership, identityId: req.params.identityId } };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "removeCertManagerIdentity",
      params: z.object({ identityId: z.string().trim().min(1) }),
      response: { 200: z.object({ identityMembership: IdentityProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { membership } = await server.services.membershipIdentity.deleteMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { identityId: req.params.identityId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.DELETE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: { identityId: req.params.identityId }
        }
      });
      return { identityMembership: { ...membership, identityId: req.params.identityId } };
    }
  });

  const certManagerGroupMembershipRoleSchema = z.object({
    id: z.string(),
    role: z.string(),
    customRoleId: z.string().optional().nullable(),
    customRoleName: z.string().optional().nullable(),
    customRoleSlug: z.string().optional().nullable(),
    isTemporary: z.boolean(),
    temporaryMode: z.string().optional().nullable(),
    temporaryRange: z.string().nullable().optional(),
    temporaryAccessStartTime: z.date().nullable().optional(),
    temporaryAccessEndTime: z.date().nullable().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional()
  });

  const certManagerGroupMembershipSchema = z.object({
    id: z.string().uuid(),
    groupId: z.string().uuid(),
    group: GroupsSchema.pick({ id: true, name: true, slug: true }).extend({
      orgId: z.string().uuid().optional()
    }),
    roles: z.array(certManagerGroupMembershipRoleSchema),
    createdAt: z.date(),
    updatedAt: z.date()
  });

  server.route({
    method: "GET",
    url: "/groups",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listCertManagerGroups",
      response: { 200: z.object({ groupMemberships: z.array(certManagerGroupMembershipSchema) }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { memberships: groupMemberships } = await server.services.membershipGroup.listMemberships({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        groupMemberships: groupMemberships.map((el) => ({
          ...el,
          groupId: el.actorGroupId as string,
          group: el.group
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/groups/:groupId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      response: { 200: z.object({ groupMembership: certManagerGroupMembershipSchema }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { membership } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { groupId: req.params.groupId }
      });
      return {
        groupMembership: {
          ...membership,
          groupId: membership.actorGroupId as string,
          group: membership.group
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "addCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      body: z.object({
        role: z.string().trim().min(1).default(ProjectMembershipRole.NoAccess).optional(),
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string(),
                isTemporary: z.literal(false).default(false)
              }),
              z.object({
                role: z.string(),
                isTemporary: z.literal(true),
                temporaryMode: z.nativeEnum(TemporaryPermissionMode),
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
                temporaryAccessStartTime: z.string().datetime()
              })
            ])
          )
          .optional()
      }),
      response: { 200: z.object({ groupMembership: certManagerGroupMembershipSchema }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const roles =
        req.body.roles ??
        (req.body.role
          ? [{ role: req.body.role, isTemporary: false }]
          : [{ role: ProjectMembershipRole.NoAccess, isTemporary: false }]);
      await server.services.membershipGroup.createMembership({
        permission: req.permission,
        data: { groupId: req.params.groupId, roles },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      const { membership: full } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { groupId: req.params.groupId }
      });
      return {
        groupMembership: {
          ...full,
          groupId: full.actorGroupId as string,
          group: full.group
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ roles: ProjectUserMembershipRolesSchema.array() }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { membership: groupMembership } = await server.services.membershipGroup.updateMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        data: { roles: req.body.roles },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      return {
        roles: groupMembership.roles.map((el) => ({ ...el, projectMembershipId: groupMembership.id }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "removeCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      response: {
        200: z.object({
          groupMembership: certManagerGroupMembershipSchema
            .pick({ id: true, groupId: true })
            .extend({ createdAt: z.date(), updatedAt: z.date() })
        })
      }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { membership: groupMembership } = await server.services.membershipGroup.deleteMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      return {
        groupMembership: {
          id: groupMembership.id,
          groupId: groupMembership.actorGroupId as string,
          createdAt: groupMembership.createdAt,
          updatedAt: groupMembership.updatedAt
        }
      };
    }
  });

  const CERT_MANAGER_ROLE_SLUGS = new Set([ProjectMembershipRole.Admin, ProjectMembershipRole.Member]);
  const CERT_MANAGER_CUSTOM_ROLE_ERROR =
    "Cert Manager does not support custom roles. Use the built-in Admin or Guest role.";

  server.route({
    method: "GET",
    url: "/roles",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listCertManagerRoles",
      response: {
        200: z.object({
          roles: ProjectRolesSchema.omit({ permissions: true, version: true, projectId: true }).array()
        })
      }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const { roles } = await server.services.role.listRoles({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        roles: roles
          .filter((el) => CERT_MANAGER_ROLE_SLUGS.has(el.slug as ProjectMembershipRole))
          .map((el) => ({
            ...el,
            name: el.slug === ProjectMembershipRole.Member ? "Guest" : el.name
          }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/roles/slug/:roleSlug",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getCertManagerRoleBySlug",
      params: z.object({ roleSlug: z.string().trim().min(1) }),
      response: { 200: z.object({ role: SanitizedRoleSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.certManagerProjectId;
      const role = await server.services.role.getRoleBySlug({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { slug: req.params.roleSlug }
      });
      return { role };
    }
  });

  server.route({
    method: "POST",
    url: "/roles",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: { operationId: "createCertManagerRole" },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });

  server.route({
    method: "PATCH",
    url: "/roles/:roleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateCertManagerRole",
      params: z.object({ roleId: z.string().trim().min(1) })
    },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });

  server.route({
    method: "DELETE",
    url: "/roles/:roleId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "deleteCertManagerRole",
      params: z.object({ roleId: z.string().trim().min(1) })
    },
    handler: async () => {
      throw new BadRequestError({ message: CERT_MANAGER_CUSTOM_ROLE_ERROR });
    }
  });
};
