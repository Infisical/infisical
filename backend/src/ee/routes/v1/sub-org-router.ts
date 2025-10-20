import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SUB_ORGANIZATIONS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";

const sanitiziedSubOrganizationSchema = OrganizationsSchema.pick({
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true
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
      description: "Create a child organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: GenericResourceNameSchema.describe(SUB_ORGANIZATIONS.CREATE.name)
      }),
      response: {
        200: z.object({
          organization: sanitiziedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.createSubOrg({
        name: req.body.name,
        permissionActor: {
          id: req.permission.id,
          type: req.permission.type,
          authMethod: req.permission.authMethod,
          orgId: req.permission.orgId,
          parentOrgId: req.permission.parentOrgId,
          rootOrgId: req.permission.rootOrgId
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
          organizations: sanitiziedSubOrganizationSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organizations } = await server.services.subOrganization.listSubOrgs({
        permissionActor: {
          id: req.permission.id,
          type: req.permission.type,
          authMethod: req.permission.authMethod,
          orgId: req.permission.orgId,
          parentOrgId: req.permission.orgId,
          rootOrgId: req.permission.rootOrgId
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
