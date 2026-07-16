import { z } from "zod";

import {
  AccessScope,
  IdentitiesSchema,
  IdentityProjectMembershipsSchema,
  ProjectMembershipRole,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { MembershipRoleSchema, RolesUpdateBodySchema } from "./schemas";

export const registerCertManagerAccessIdentitiesRouter = async (server: FastifyZodProvider) => {
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
              identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true, projectId: true })
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
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
    url: "/available-identities",
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
      const projectId = req.internalCertManagerProjectId;
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
      params: z.object({ identityId: z.string().trim().uuid() }),
      response: {
        200: z.object({
          identityMembership: z.object({
            id: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
            roles: z.array(MembershipRoleSchema),
            lastLoginAuthMethod: z.string().nullable().optional(),
            lastLoginTime: z.date().nullable().optional(),
            identity: IdentitiesSchema.pick({
              name: true,
              id: true,
              orgId: true,
              projectId: true,
              hasDeleteProtection: true
            }).extend({
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
      const projectId = req.internalCertManagerProjectId;
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
      params: z.object({ identityId: z.string().trim().uuid() }),
      body: z.object({
        role: z.string().trim().optional().default(ProjectMembershipRole.Member),
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
      const projectId = req.internalCertManagerProjectId;
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
        projectId,
        event: {
          type: EventType.ADD_CERT_MANAGER_IDENTITY,
          metadata: {
            identityId: req.params.identityId,
            membershipId: membership.id,
            roles: (roles || [{ role }]).map((r) => r.role)
          }
        }
      });
      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertManagerIdentityAdded,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId
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
      params: z.object({ identityId: z.string().trim().uuid() }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ identityMembership: IdentityProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { membership } = await server.services.membershipIdentity.updateMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { identityId: req.params.identityId },
        data: { roles: req.body.roles }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_CERT_MANAGER_IDENTITY,
          metadata: {
            identityId: req.params.identityId,
            membershipId: membership.id,
            roles: req.body.roles.map((r) => r.role)
          }
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
      params: z.object({ identityId: z.string().trim().uuid() }),
      response: { 200: z.object({ identityMembership: IdentityProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { membership } = await server.services.membershipIdentity.deleteMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { identityId: req.params.identityId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_CERT_MANAGER_IDENTITY,
          metadata: { identityId: req.params.identityId, membershipId: membership.id }
        }
      });
      return { identityMembership: { ...membership, identityId: req.params.identityId } };
    }
  });
};
