import { z } from "zod";

import { ExternalGroupOrgRoleMappingsSchema } from "@app/db/schemas/external-group-org-role-mappings";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, Scim } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerExternalGroupOrgRoleMappingRouter = async (server: FastifyZodProvider) => {
  // get mappings for current org
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Scim],
      response: {
        200: ExternalGroupOrgRoleMappingsSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mappings = server.services.externalGroupOrgRoleMapping.listExternalGroupOrgRoleMappings(req.permission);

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS
        }
      });

      return mappings;
    }
  });

  // update mappings for current org
  server.route({
    method: "PUT", // using put since this endpoint creates, updates and deletes mappings
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Scim],
      body: z.object({
        mappings: z
          .object({
            groupName: z.string().trim().min(1).describe(Scim.UPDATE_GROUP_ORG_ROLE_MAPPINGS.groupName),
            roleSlug: slugSchema({ max: 64 }).describe(Scim.UPDATE_GROUP_ORG_ROLE_MAPPINGS.roleSlug)
          })
          .array()
      }),
      response: {
        200: ExternalGroupOrgRoleMappingsSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { body, permission } = req;

      const mappings = server.services.externalGroupOrgRoleMapping.updateExternalGroupOrgRoleMappings(body, permission);

      await server.services.auditLog.createAuditLog({
        orgId: permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_EXTERNAL_GROUP_ORG_ROLE_MAPPINGS,
          metadata: body
        }
      });

      return mappings;
    }
  });
};
