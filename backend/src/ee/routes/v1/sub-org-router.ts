import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SUB_ORGANIZATIONS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSubOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SubOrganizations],
      description: "Create a child organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: z.string().trim().describe(SUB_ORGANIZATIONS.CREATE.name)
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.createSubOrg({
        name: req.body.name,
        permissionActor: {
          id: req.permission.id,
          type: req.permission.type,
          authMethod: req.permission.authMethod,
          orgId: req.permission.orgId,
          parentOrgId: req.permission.parentOrgId
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_CHILD_ORGANIZATION,
          metadata: {
            name: req.body.name,
            organizationId: organization.id
          }
        }
      });

      return { organization };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SubOrganizations],
      description: "List child organizations",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(25).describe(SUB_ORGANIZATIONS.LIST.limit),
        offset: z.coerce.number().min(0).default(0).describe(SUB_ORGANIZATIONS.LIST.offset),
        isAccessible: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
          .describe(SUB_ORGANIZATIONS.LIST.isAccessible)
      }),
      response: {
        200: z.object({
          organizations: OrganizationsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organizations } = await server.services.subOrganization.listSubOrgs({
        permissionActor: {
          id: req.permission.id,
          type: req.permission.type,
          authMethod: req.permission.authMethod,
          orgId: req.permission.orgId,
          parentOrgId: req.permission.orgId
        },
        data: {
          limit: req.query.limit,
          offset: req.query.offset,
          isAccessible: req.query.isAccessible
        }
      });

      return { organizations };
    }
  });
};
