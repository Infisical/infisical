import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AppConnection } from "@app/lib/app-connections";
import { SanitizedAwsConnectionSchema } from "@app/lib/app-connections/aws";
import { SanitizedGitHubConnectionSchema } from "@app/lib/app-connections/github";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// can't use discriminated due to multiple schemas for certain apps
export const SanitizedAppConnectionSchema = z.union([
  ...SanitizedAwsConnectionSchema.options,
  ...SanitizedGitHubConnectionSchema.options
]);

export const registerAppConnectionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List the available App Connection Options.",
      response: {
        200: z.object({
          appConnectionOptions: z
            .object({
              name: z.string(),
              app: z.nativeEnum(AppConnection),
              methods: z.string().array()
            })
            .passthrough()
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: () => {
      const appConnectionOptions = server.services.appConnection.listAppConnectionOptions();
      return { appConnectionOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List all the App Connections for the current organization.",
      response: {
        200: z.object({ appConnections: SanitizedAppConnectionSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const appConnections = await server.services.appConnection.listAppConnectionsByOrg(req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTIONS
        }
      });

      return { appConnections };
    }
  });
};
