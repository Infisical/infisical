import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  PostgresResourceListItemSchema,
  SanitizedPostgresResourceSchema
} from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Use z.union([...]) when more resources are added
const SanitizedResourceSchema = SanitizedPostgresResourceSchema;

const ResourceOptionsSchema = z.discriminatedUnion("resource", [PostgresResourceListItemSchema]);

export const registerPamResourceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM resource types",
      response: {
        200: z.object({
          resourceOptions: ResourceOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: () => {
      const resourceOptions = server.services.pamResource.listResourceOptions();

      return { resourceOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM resources",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resources: SanitizedResourceSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamResource.list(req.query.projectId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_RESOURCE_LIST,
          metadata: {
            count: response.resources.length
          }
        }
      });

      return response;
    }
  });
};
