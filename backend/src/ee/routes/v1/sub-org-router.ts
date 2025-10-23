import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SUB_ORGANIZATIONS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedSubOrganizationSchema = OrganizationsSchema.pick({
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  parentOrgId: true
});

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
      description: "Create a sub organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: slugSchema().describe(SUB_ORGANIZATIONS.CREATE.name)
      }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.createSubOrg({
        name: req.body.name,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_SUB_ORGANIZATION,
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
      description: "List of sub organizations",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        limit: z.coerce.number().min(1).max(1000).default(25).describe(SUB_ORGANIZATIONS.LIST.limit),
        offset: z.coerce.number().min(0).default(0).describe(SUB_ORGANIZATIONS.LIST.offset),
        isAccessible: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
          .describe(SUB_ORGANIZATIONS.LIST.isAccessible)
      }),
      response: {
        200: z.object({
          organizations: sanitizedSubOrganizationSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organizations } = await server.services.subOrganization.listSubOrgs({
        permissionActor: req.permission,
        data: {
          limit: req.query.limit,
          offset: req.query.offset,
          isAccessible: req.query.isAccessible
        }
      });

      return { organizations };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:subOrgId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SubOrganizations],
      description: "Update a sub organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        subOrgId: z.string().trim().describe(SUB_ORGANIZATIONS.UPDATE.subOrgId)
      }),
      body: z.object({
        name: slugSchema().describe(SUB_ORGANIZATIONS.UPDATE.name)
      }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.updateSubOrg({
        subOrgId: req.params.subOrgId,
        name: req.body.name,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_SUB_ORGANIZATION,
          metadata: {
            name: req.body.name,
            organizationId: organization.id
          }
        }
      });

      return { organization };
    }
  });
};
