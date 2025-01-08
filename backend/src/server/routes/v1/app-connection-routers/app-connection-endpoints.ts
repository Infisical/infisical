import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AppConnections } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnection, TAppConnectionInput } from "@app/services/app-connection/app-connection-types";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAppConnectionEndpoints = <T extends TAppConnection, I extends TAppConnectionInput>({
  server,
  app,
  createSchema,
  updateSchema,
  sanitizedResponseSchema
}: {
  app: AppConnection;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    method: I["method"];
    credentials: I["credentials"];
    description?: string | null;
  }>;
  updateSchema: z.ZodType<{ name?: string; credentials?: I["credentials"]; description?: string | null }>;
  sanitizedResponseSchema: z.ZodTypeAny;
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
        200: z.object({ appConnections: sanitizedResponseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnections = (await server.services.appConnection.listAppConnectionsByOrg(req.permission, app)) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_APP_CONNECTIONS,
          metadata: {
            app,
            count: appConnections.length,
            connectionIds: appConnections.map((connection) => connection.id)
          }
        }
      });

      return { appConnections };
    }
  });

  server.route({
    method: "GET",
    url: "/available",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `List the ${appName} Connections the current user has permission to establish connections with.`,
      response: {
        200: z.object({
          appConnections: z.object({ app: z.literal(app), name: z.string(), id: z.string().uuid() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnections = await server.services.appConnection.listAvailableAppConnectionsForUser(
        app,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_AVAILABLE_APP_CONNECTIONS_DETAILS,
          metadata: {
            app,
            count: appConnections.length,
            connectionIds: appConnections.map((connection) => connection.id)
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
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
          .trim()
          .min(1, "Connection name required")
          .describe(AppConnections.GET_BY_NAME(app).connectionName)
      }),
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
      description: `Create ${
        startsWithVowel(appName) ? "an" : "a"
      } ${appName} Connection for the current organization.`,
      body: createSchema,
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name, method, credentials, description } = req.body;

      const appConnection = (await server.services.appConnection.createAppConnection(
        { name, method, app, credentials, description },
        req.permission
      )) as T;

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
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name, credentials, description } = req.body;
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.updateAppConnection(
        { name, credentials, connectionId, description },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_APP_CONNECTION,
          metadata: {
            name,
            description,
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
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
