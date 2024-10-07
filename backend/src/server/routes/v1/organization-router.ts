import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  AuditLogsSchema,
  GroupsSchema,
  IncidentContactsSchema,
  OrganizationsSchema,
  OrgMembershipsSchema,
  OrgRolesSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOGS, ORGANIZATIONS } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { getLastMidnightDateISO } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          organizations: OrganizationsSchema.extend({
            orgAuthMethod: z.string()
          }).array()
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
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const organization = await server.services.org.findOrganizationById(
        req.permission.id,
        req.params.organizationId,
        req.permission.authMethod,
        req.permission.orgId
      );
      return { organization };
    }
  });

  server.route({
    method: "GET",
    url: "/audit-logs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get all audit logs for an organization",
      querystring: z.object({
        projectId: z.string().optional().describe(AUDIT_LOGS.EXPORT.projectId),
        actorType: z.nativeEnum(ActorType).optional(),
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
        limit: z.coerce.number().default(20).describe(AUDIT_LOGS.EXPORT.limit),
        actor: z.string().optional().describe(AUDIT_LOGS.EXPORT.actor)
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
                project: z
                  .object({
                    name: z.string(),
                    slug: z.string()
                  })
                  .optional(),
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const appCfg = getConfig();
      if (appCfg.isCloud) {
        throw new BadRequestError({ message: "Infisical cloud audit log is in maintenance mode." });
      }

      const auditLogs = await server.services.auditLog.listAuditLogs({
        filter: {
          ...req.query,
          endDate: req.query.endDate,
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
                id: true
              }).merge(z.object({ publicKey: z.string().nullable() }))
            })
          )
            .omit({ createdAt: true, updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const users = await server.services.org.findAllOrgMembers(
        req.permission.id,
        req.params.organizationId,
        req.permission.authMethod,
        req.permission.orgId
      );
      return { users };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:organizationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      body: z.object({
        name: z.string().trim().max(64, { message: "Name must be 64 or fewer characters" }).optional(),
        slug: z
          .string()
          .trim()
          .max(64, { message: "Slug must be 64 or fewer characters" })
          .regex(/^[a-zA-Z0-9-]+$/, "Slug must only contain alphanumeric characters or hyphens")
          .optional(),
        authEnforced: z.boolean().optional(),
        scimEnabled: z.boolean().optional(),
        defaultMembershipRoleSlug: z
          .string()
          .min(1)
          .trim()
          .refine((v) => slugify(v) === v, {
            message: "Membership role must be a valid slug"
          })
          .optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          organization: OrganizationsSchema
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

      return {
        message: "Successfully changed organization name",
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
      params: z.object({
        organizationId: z.string().trim().describe(ORGANIZATIONS.LIST_GROUPS.organizationId)
      }),
      response: {
        200: z.object({
          groups: GroupsSchema.merge(
            z.object({
              customRole: OrgRolesSchema.pick({
                id: true,
                name: true,
                slug: true,
                permissions: true,
                description: true
              }).optional()
            })
          ).array()
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
};
