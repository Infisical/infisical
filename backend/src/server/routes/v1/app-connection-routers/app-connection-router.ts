import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AwsConnectionListItemSchema, SanitizedAwsConnectionSchema } from "@app/services/app-connection/aws";
import { GitHubConnectionListItemSchema, SanitizedGitHubConnectionSchema } from "@app/services/app-connection/github";
import { AuthMode } from "@app/services/auth/auth-type";

// can't use discriminated due to multiple schemas for certain apps
const SanitizedAppConnectionSchema = z.union([
  ...SanitizedAwsConnectionSchema.options,
  ...SanitizedGitHubConnectionSchema.options
]);

const AppConnectionOptionsSchema = z.discriminatedUnion("app", [
  AwsConnectionListItemSchema,
  GitHubConnectionListItemSchema
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
          appConnectionOptions: AppConnectionOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnections = await server.services.appConnection.listAppConnectionsByOrg(req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTIONS,
          metadata: {
            count: appConnections.length,
            connectionIds: appConnections.map((connection) => connection.id)
          }
        }
      });

      return { appConnections };
    }
  });
};
