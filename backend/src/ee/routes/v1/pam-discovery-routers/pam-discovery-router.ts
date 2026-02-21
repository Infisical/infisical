import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ActiveDirectoryDiscoveryListItemSchema,
  SanitizedActiveDirectoryDiscoverySourceSchema
} from "@app/ee/services/pam-discovery/active-directory/active-directory-discovery-schemas";
import { PamDiscoveryOrderBy } from "@app/ee/services/pam-discovery/pam-discovery-enums";
import { OrderByDirection } from "@app/lib/types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedDiscoverySourcesSchema = z.discriminatedUnion("discoveryType", [
  SanitizedActiveDirectoryDiscoverySourceSchema
]);

const DiscoveryOptionsSchema = z.discriminatedUnion("discoveryType", [ActiveDirectoryDiscoveryListItemSchema]);

export const registerPamDiscoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM discovery types",
      response: {
        200: z.object({
          discoveryOptions: DiscoveryOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: () => {
      const discoveryOptions = server.services.pamDiscoverySource.listDiscoverySourceOptions();
      return { discoveryOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM discovery sources",
      querystring: z.object({
        projectId: z.string().uuid(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(100),
        orderBy: z.nativeEnum(PamDiscoveryOrderBy).default(PamDiscoveryOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        search: z.string().trim().optional(),
        filterDiscoveryTypes: z
          .string()
          .transform((val) =>
            val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
          .optional()
      }),
      response: {
        200: z.object({
          sources: SanitizedDiscoverySourcesSchema.and(
            z.object({
              totalResources: z.number(),
              totalAccounts: z.number()
            })
          ).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sources, totalCount } = await server.services.pamDiscoverySource.list({
        ...req.query,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_DISCOVERY_SOURCE_LIST,
          metadata: {
            count: totalCount
          }
        }
      });

      return { sources, totalCount };
    }
  });
};
