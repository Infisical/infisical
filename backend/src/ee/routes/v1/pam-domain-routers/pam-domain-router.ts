import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamDomainOrderBy } from "@app/ee/services/pam-domain/pam-domain-enums";
import {
  ActiveDirectoryDomainListItemSchema,
  SanitizedDomainSchema
} from "@app/ee/services/pam-domain/pam-domain-schemas";
import { OrderByDirection } from "@app/lib/types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const DomainOptionsSchema = z.discriminatedUnion("domain", [ActiveDirectoryDomainListItemSchema]);

export const registerPamDomainRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPamDomainOptions",
      description: "List available PAM domain types",
      response: {
        200: z.object({
          options: DomainOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const options = server.services.pamDomain.listDomainOptions();
      return { options };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPamDomains",
      description: "List PAM domains",
      querystring: z.object({
        projectId: z.string().uuid(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        orderBy: z.nativeEnum(PamDomainOrderBy).default(PamDomainOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        filterDomainTypes: z
          .string()
          .transform((val) =>
            val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
          .optional(),
        discoveryFingerprint: z.string().optional()
      }),
      response: {
        200: z.object({
          domains: SanitizedDomainSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, search, limit, offset, orderBy, orderDirection, filterDomainTypes, discoveryFingerprint } =
        req.query;

      const { domains, totalCount } = await server.services.pamDomain.list({
        projectId,
        search,
        limit,
        offset,
        orderBy,
        orderDirection,
        filterDomainTypes,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        discoveryFingerprint
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_DOMAIN_LIST,
          metadata: {
            count: domains.length
          }
        }
      });

      return { domains, totalCount };
    }
  });
};
