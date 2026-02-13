import RE2 from "re2";
import { z } from "zod";

import {
  AccessScope,
  AuditLogsSchema,
  GroupsSchema,
  IncidentContactsSchema,
  OrgMembershipsSchema,
  OrgMembershipStatus,
  OrgRolesSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AUDIT_LOGS, ORGANIZATIONS } from "@app/lib/api-docs";
import { getLastMidnightDateISO, removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema, slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode, MfaMethod } from "@app/services/auth/auth-type";
import { sanitizedOrganizationSchema } from "@app/services/org/org-schema";

import { integrationAuthPubSchema } from "../sanitizedSchemas";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOrganizations",
      response: {
        200: z.object({
          organizations: sanitizedOrganizationSchema
            .extend({
              orgAuthMethod: z.string(),
              userRole: z.string(),
              userJoinedAt: z.date()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const organizations = await server.services.org.findAllOrganizationOfUser(req.permission.id);
      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getOrganizationById",
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: sanitizedOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const organization = await server.services.org.findOrganizationById({
        userId: req.permission.id,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        rootOrgId: req.permission.rootOrgId,
        actorOrgId: req.permission.orgId
      });
      return { organization };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/integration-authorizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOrganizationIntegrationAuthorizations",
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          authorizations: integrationAuthPubSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const authorizations = await server.services.integrationAuth.listOrgIntegrationAuth({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      return { authorizations };
    }
  });

  server.route({
    method: "GET",
    url: "/audit-logs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listOrganizationAuditLogs",
      tags: [ApiDocsTags.AuditLogs],
      description: "Get all audit logs for an organization",
      querystring: z
        .object({
          projectId: z.string().optional().describe(AUDIT_LOGS.EXPORT.projectId),
          environment: z.string().optional().describe(AUDIT_LOGS.EXPORT.environment),
          actorType: z.nativeEnum(ActorType).optional(),
          secretPath: z
            .string()
            .optional()
            .transform((val) => (!val ? val : removeTrailingSlash(val)))
            .describe(AUDIT_LOGS.EXPORT.secretPath),
          secretKey: z.string().optional().describe(AUDIT_LOGS.EXPORT.secretKey),
          // eventType is split with , for multiple values, we need to transform it to array
          eventType: z
            .string()
            .optional()
            .transform((val) => (val ? val.split(",") : undefined)),
          userAgentType: z.nativeEnum(UserAgentType).optional().describe(AUDIT_LOGS.EXPORT.userAgentType),
          eventMetadata: z
            .string()
            .optional()
            .transform((val) => {
              if (!val) {
                return undefined;
              }

              const pairs = val.split(",");

              return pairs.reduce(
                (acc, pair) => {
                  const [key, value] = pair.split("=");
                  if (key && value) {
                    acc[key] = value;
                  }
                  return acc;
                },
                {} as Record<string, string>
              );
            })
            .describe(AUDIT_LOGS.EXPORT.eventMetadata),
          startDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.startDate),
          endDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.endDate),
          offset: z.coerce.number().default(0).describe(AUDIT_LOGS.EXPORT.offset),
          limit: z.coerce.number().max(1000).default(20).describe(AUDIT_LOGS.EXPORT.limit),
          actor: z.string().optional().describe(AUDIT_LOGS.EXPORT.actor)
        })
        .superRefine((el, ctx) => {
          if (el.endDate && el.startDate) {
            const startDate = new Date(el.startDate);
            const endDate = new Date(el.endDate);
            const maxAllowedDate = new Date(startDate);
            maxAllowedDate.setMonth(maxAllowedDate.getMonth() + 3);
            if (endDate < startDate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date cannot be before start date"
              });
            }
            if (endDate > maxAllowedDate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "Dates must be within 3 months"
              });
            }
          }
        }),
      response: {
        200: z.object({
          auditLogs: AuditLogsSchema.omit({
            eventMetadata: true,
            eventType: true,
            actor: true,
            actorMetadata: true
          })
            .merge(
              z.object({
                event: z.object({
                  type: z.string(),
                  metadata: z.any()
                }),
                actor: z.object({
                  type: z.string(),
                  metadata: z.any()
                })
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogs = await server.services.auditLog.listAuditLogs({
        filter: {
          ...req.query,
          endDate: req.query.endDate || new Date().toISOString(),
          projectId: req.query.projectId,
          startDate: req.query.startDate || getLastMidnightDateISO(),
          auditLogActorId: req.query.actor,
          actorType: req.query.actorType,
          eventType: req.query.eventType as EventType[] | undefined
        },
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return { auditLogs };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOrganizationUsers",
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          users: OrgMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                id: true,
                superAdmin: true
              }).merge(z.object({ publicKey: z.string().nullable().optional() }))
            })
          )
            .omit({ createdAt: true, updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const users = await server.services.org.findAllOrgMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { users: users.map((el) => ({ ...el, status: el.status || OrgMembershipStatus.Accepted })) };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateOrganization",
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        name: GenericResourceNameSchema.optional(),
        slug: slugSchema({ max: 64 }).optional(),
        authEnforced: z.boolean().optional(),
        googleSsoAuthEnforced: z.boolean().optional(),
        scimEnabled: z.boolean().optional(),
        defaultMembershipRoleSlug: slugSchema({ max: 64, field: "Default Membership Role" }).optional(),
        enforceMfa: z.boolean().optional(),
        selectedMfaMethod: z.nativeEnum(MfaMethod).optional(),
        allowSecretSharingOutsideOrganization: z.boolean().optional(),
        bypassOrgAuthEnabled: z.boolean().optional(),
        userTokenExpiration: z
          .string()
          .refine((val) => new RE2(/^\d+[mhdw]$/).test(val), "Must be a number followed by m, h, d, or w")
          .refine(
            (val) => {
              const numericPart = val.slice(0, -1);
              return parseInt(numericPart, 10) >= 1;
            },
            { message: "Duration value must be at least 1" }
          )
          .optional(),
        secretsProductEnabled: z.boolean().optional(),
        pkiProductEnabled: z.boolean().optional(),
        kmsProductEnabled: z.boolean().optional(),
        sshProductEnabled: z.boolean().optional(),
        scannerProductEnabled: z.boolean().optional(),
        shareSecretsProductEnabled: z.boolean().optional(),
        maxSharedSecretLifetime: z
          .number()
          .min(300, "Max Shared Secret lifetime cannot be under 5 minutes")
          .max(2592000, "Max Shared Secret lifetime cannot exceed 30 days")
          .optional(),
        maxSharedSecretViewLimit: z
          .number()
          .min(1, "Max Shared Secret view count cannot be lower than 1")
          .max(1000, "Max Shared Secret view count cannot exceed 1000")
          .nullable()
          .optional(),
        blockDuplicateSecretSyncDestinations: z
          .boolean()
          .optional()
          .describe("Block duplicate secret sync destinations across the organization"),
        secretShareBrandConfig: z
          .object({
            primaryColor: z
              .string()
              .refine(
                (val) => !val || new RE2(/^#[0-9A-Fa-f]{6}$/).test(val),
                "Primary color must be a valid hex color (e.g., #FF5733)"
              )
              .optional()
              .or(z.literal("")),
            secondaryColor: z
              .string()
              .refine(
                (val) => !val || new RE2(/^#[0-9A-Fa-f]{6}$/).test(val),
                "Secondary color must be a valid hex color (e.g., #FF5733)"
              )
              .optional()
              .or(z.literal(""))
          })
          .nullable()
          .optional()
          .describe("Custom branding configuration for secret sharing pages")
      }),
      response: {
        200: z.object({
          message: z.string(),
          organization: sanitizedOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const organization = await server.services.org.updateOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_ORG,
          metadata: req.body
        }
      });

      return {
        message: "Successfully updated organization",
        organization
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/incidentContactOrg",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOrganizationIncidentContacts",
      params: z.object({ organizationId: z.string().trim() }),
      response: {
        200: z.object({
          incidentContactsOrg: IncidentContactsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const incidentContactsOrg = await req.server.services.org.findIncidentContacts(
        req.permission.id,
        req.params.organizationId,
        req.permission.authMethod,
        req.permission.orgId
      );
      return { incidentContactsOrg };
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/incidentContactOrg",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createOrganizationIncidentContact",
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({ email: z.string().email().trim() }),
      response: {
        200: z.object({
          incidentContactsOrg: IncidentContactsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const incidentContactsOrg = await req.server.services.org.createIncidentContact(
        req.permission.id,
        req.params.organizationId,
        req.body.email,
        req.permission.authMethod,
        req.permission.orgId
      );
      return { incidentContactsOrg };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:organizationId/incidentContactOrg/:incidentContactId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteOrganizationIncidentContact",
      params: z.object({ organizationId: z.string().trim(), incidentContactId: z.string().trim() }),
      response: {
        200: z.object({
          incidentContactsOrg: IncidentContactsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const incidentContactsOrg = await req.server.services.org.deleteIncidentContact(
        req.permission.id,
        req.params.organizationId,
        req.params.incidentContactId,
        req.permission.authMethod,
        req.permission.orgId
      );
      return { incidentContactsOrg };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/groups",
    schema: {
      deprecated: true,
      operationId: "listOrganizationGroups",
      description:
        "Deprecated: Use GET /api/v1/organizations/memberships/groups instead. This route was migrated to the new membership design.",
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.LIST_GROUPS.organizationId)
      }),
      response: {
        200: z.object({
          groups: GroupsSchema.extend({
            role: z.string(),
            roleId: z.string().nullish(),
            customRole: OrgRolesSchema.pick({
              id: true,
              name: true,
              slug: true,
              permissions: true,
              description: true
            }).optional()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const groups = await server.services.org.getOrgGroups({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.params.organizationId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { groups };
    }
  });

  server.route({
    method: "GET",
    url: "/users/available",
    schema: {
      operationId: "listAvailableOrganizationUsers",
      response: {
        200: z.object({
          users: z
            .object({
              id: z.string().uuid(),
              username: z.string(),
              email: z.string().nullable().optional(),
              firstName: z.string().nullable().optional(),
              lastName: z.string().nullable().optional()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { users } = await server.services.membershipUser.listAvailableUsers({
        permission: req.permission,
        scopeData: {
          orgId: req.permission.orgId,
          scope: AccessScope.Organization
        },
        data: {}
      });

      return { users };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/available",
    schema: {
      operationId: "listAvailableOrganizationMachineIdentities",
      response: {
        200: z.object({
          identities: z
            .object({
              id: z.string().uuid(),
              name: z.string(),
              hasDeleteProtection: z.boolean()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { identities } = await server.services.membershipIdentity.listAvailableIdentities({
        permission: req.permission,
        scopeData: {
          orgId: req.permission.orgId,
          scope: AccessScope.Organization
        },
        data: {}
      });

      return { identities };
    }
  });
};
