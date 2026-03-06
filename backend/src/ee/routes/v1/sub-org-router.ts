import { z } from "zod";

import { OrganizationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SUB_ORGANIZATIONS } from "@app/lib/api-docs";
import { pick } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { GenericResourceNameSchema, slugSchema } from "@app/server/lib/schemas";
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
      operationId: "createSubOrganization",
      tags: [ApiDocsTags.SubOrganizations],
      description: "Create a sub organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        name: GenericResourceNameSchema.describe(SUB_ORGANIZATIONS.CREATE.name),
        slug: slugSchema().optional().describe(SUB_ORGANIZATIONS.CREATE.slug)
      }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.createSubOrg({
        name: req.body.name,
        slug: req.body.slug,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_SUB_ORGANIZATION,
          metadata: {
            ...pick(organization, ["name", "slug"]),
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
      operationId: "listSubOrganizations",
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
        search: z.string().trim().optional().describe(SUB_ORGANIZATIONS.LIST.search),
        orderBy: z.enum(["name"]).default("name").describe(SUB_ORGANIZATIONS.LIST.orderBy),
        orderDirection: z.enum(["asc", "desc"]).default("asc").describe(SUB_ORGANIZATIONS.LIST.orderDirection),
        isAccessible: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
          .describe(SUB_ORGANIZATIONS.LIST.isAccessible)
      }),
      response: {
        200: z.object({
          organizations: sanitizedSubOrganizationSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organizations, totalCount } = await server.services.subOrganization.listSubOrgs({
        permissionActor: req.permission,
        data: {
          limit: req.query.limit,
          offset: req.query.offset,
          search: req.query.search,
          orderBy: req.query.orderBy,
          orderDirection: req.query.orderDirection,
          isAccessible: req.query.isAccessible
        }
      });

      return { organizations, totalCount };
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
      operationId: "updateSubOrganization",
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
      body: z
        .object({
          name: GenericResourceNameSchema.optional().describe(SUB_ORGANIZATIONS.UPDATE.name),
          slug: slugSchema().optional().describe(SUB_ORGANIZATIONS.UPDATE.slug)
        })
        .refine((data) => data.name !== undefined || data.slug !== undefined, {
          message: "At least one field (name or slug) must be provided"
        }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.updateSubOrg({
        subOrgId: req.params.subOrgId,
        name: req.body.name,
        slug: req.body.slug,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_SUB_ORGANIZATION,
          metadata: {
            ...pick(organization, ["name", "slug"]),
            organizationId: organization.id
          }
        }
      });

      return { organization };
    }
  });

  server.route({
    method: "POST",
    url: "/:subOrgId/memberships",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createSubOrganizationMembership",
      tags: [ApiDocsTags.SubOrganizations],
      description: "Join a sub organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        subOrgId: z.string().trim().describe(SUB_ORGANIZATIONS.JOIN.subOrgId)
      }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.joinSubOrg({
        subOrgId: req.params.subOrgId,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.JOIN_SUB_ORGANIZATION,
          metadata: {
            ...pick(organization, ["name", "slug"]),
            organizationId: organization.id
          }
        }
      });

      return { organization };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:subOrgId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "deleteSubOrganization",
      tags: [ApiDocsTags.SubOrganizations],
      description: "Delete a sub organization",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        subOrgId: z.string().trim().describe(SUB_ORGANIZATIONS.DELETE.subOrgId)
      }),
      response: {
        200: z.object({
          organization: sanitizedSubOrganizationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { organization } = await server.services.subOrganization.deleteSubOrg({
        subOrgId: req.params.subOrgId,
        permissionActor: req.permission
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_SUB_ORGANIZATION,
          metadata: {
            ...pick(organization, ["name", "slug"]),
            organizationId: organization.id
          }
        }
      });

      return { organization };
    }
  });
};
