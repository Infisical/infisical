import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AppConnections } from "@app/lib/api-docs";
import { AppConnection, TAppConnection, TAppConnectionInput } from "@app/lib/app-connections";
import { APP_CONNECTION_NAME_MAP } from "@app/lib/app-connections/maps";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAppConnectionEndpoints = <T extends TAppConnection, I extends TAppConnectionInput>({
  server,
  app,
  createSchema,
  updateSchema,
  responseSchema
}: {
  app: AppConnection;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{ name: string; method: I["method"]; credentials: I["credentials"] }>;
  updateSchema: z.ZodType<{ name?: string; credentials?: I["credentials"] }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const appName = APP_CONNECTION_NAME_MAP[app];

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `List the ${appName} Connections for the current organization.`,
      response: {
        200: z.object({ appConnections: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const appConnections = (await server.services.appConnection.listAppConnectionsByOrg(req.permission, app)) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTIONS,
          metadata: {
            app
          }
        }
      });

      return { appConnections };
    }
  });

  server.route({
    method: "GET",
    url: "/:connectionId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `Get the specified ${appName} Connection by ID.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.GET_BY_ID(app).connectionId)
      }),
      response: {
        200: z.object({ appConnection: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.findAppConnectionById(
        app,
        connectionId,
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTION,
          metadata: {
            connectionId
          }
        }
      });

      return { appConnection };
    }
  });

  server.route({
    method: "GET",
    url: `/name/:connectionName`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `Get the specified ${appName} Connection by name.`,
      params: z.object({
        connectionName: z
          .string()
          .min(0, "Connection name required")
          .describe(AppConnections.GET_BY_NAME(app).connectionName)
      }),
      response: {
        200: z.object({ appConnection: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const { connectionName } = req.params;

      const appConnection = (await server.services.appConnection.findAppConnectionByName(
        app,
        connectionName,
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTION,
          metadata: {
            connectionId: appConnection.id
          }
        }
      });

      return { appConnection };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Create an ${appName} Connection for the current organization.`,
      body: createSchema,
      response: {
        200: z.object({ appConnection: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const { name, method, credentials } = req.body;

      const appConnection = (await server.services.appConnection.createAppConnection(
        { name, method, app, credentials },
        req.permission
      )) as TAppConnection;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_APP_CONNECTION,
          metadata: {
            name,
            method,
            app,
            connectionId: appConnection.id
          }
        }
      });

      return { appConnection };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:connectionId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Update the specified ${appName} Connection.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.UPDATE(app).connectionId)
      }),
      body: updateSchema,
      response: {
        200: z.object({ appConnection: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const { name, credentials } = req.body;
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.updateAppConnection(
        { name, credentials, connectionId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_APP_CONNECTION,
          metadata: {
            name,
            credentialsUpdated: Boolean(credentials),
            connectionId
          }
        }
      });

      return { appConnection };
    }
  });

  server.route({
    method: "DELETE",
    url: `/:connectionId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Delete the specified ${appName} Connection.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.DELETE(app).connectionId)
      }),
      response: {
        200: z.object({ appConnection: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.deleteAppConnection(
        app,
        connectionId,
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_APP_CONNECTION,
          metadata: {
            connectionId
          }
        }
      });

      return { appConnection };
    }
  });
};
