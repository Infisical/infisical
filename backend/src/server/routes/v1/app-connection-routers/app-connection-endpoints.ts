import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnection, TAppConnectionInput } from "@app/services/app-connection/app-connection-types";
import { AuthMode } from "@app/services/auth/auth-type";

// Convert app enum value to PascalCase for operationId
const getAppNameForOperationId = (app: AppConnection): string => {
  // Handle special cases
  const specialCases: Record<string, string> = {
    [AppConnection.OnePass]: "OnePassword",
    [AppConnection.GitHub]: "GitHub",
    [AppConnection.GitHubRadar]: "GitHubRadar",
    [AppConnection.GitLab]: "GitLab",
    [AppConnection.MsSql]: "MsSql",
    [AppConnection.MySql]: "MySql",
    [AppConnection.OCI]: "Oci",
    [AppConnection.OracleDB]: "OracleDb",
    [AppConnection.AWS]: "Aws",
    [AppConnection.GCP]: "Gcp",
    [AppConnection.LDAP]: "Ldap",
    [AppConnection.Okta]: "Okta",
    [AppConnection.Redis]: "Redis",
    [AppConnection.MongoDB]: "MongoDb",
    [AppConnection.SSH]: "Ssh"
  };

  if (specialCases[app]) {
    return specialCases[app];
  }

  // Convert kebab-case to PascalCase
  return app
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
};

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
    isPlatformManagedCredentials?: boolean;
    gatewayId?: string | null;
    projectId?: string;
  }>;
  updateSchema: z.ZodType<{
    name?: string;
    credentials?: I["credentials"];
    description?: string | null;
    isPlatformManagedCredentials?: boolean;
    gatewayId?: string | null;
  }>;
  sanitizedResponseSchema: z.ZodTypeAny;
}) => {
  const appName = APP_CONNECTION_NAME_MAP[app];
  const appNameForOpId = getAppNameForOperationId(app);

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `listAppConnections${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
      description: `List the ${appName} Connections for the current organization or project.`,
      querystring: z.object({
        projectId: z.string().optional().describe(AppConnections.LIST(app).projectId)
      }),
      response: {
        200: z.object({ appConnections: sanitizedResponseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId } = req.query;
      const appConnections = (await server.services.appConnection.listAppConnections(
        req.permission,
        app,
        projectId
      )) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
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
      hide: false,
      operationId: `listAvailableAppConnections${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
      description: `List the ${appName} Connections the current user has permission to establish connections within this project.`,
      querystring: z.object({
        projectId: z.string().optional().describe(AppConnections.LIST(app).projectId)
      }),
      response: {
        200: z.object({
          appConnections: z
            .object({
              app: z.literal(app),
              name: z.string(),
              id: z.string().uuid(),
              projectId: z.string().nullish(),
              orgId: z.string()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId } = req.query;
      const appConnections = await server.services.appConnection.listAvailableAppConnectionsForUser(
        app,
        req.permission,
        projectId
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
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
      hide: false,
      operationId: `getAppConnection${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
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
        projectId: appConnection.projectId ?? undefined,
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
    url: `/connection-name/:connectionName`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `getAppConnectionByName${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
      description: `Get the specified ${appName} Connection by name.`,
      params: z.object({
        connectionName: z
          .string()
          .trim()
          .min(1, "Connection name required")
          .describe(AppConnections.GET_BY_NAME(app).connectionName)
      }),
      querystring: z.object({
        projectId: z.string().trim().optional().describe(AppConnections.GET_BY_NAME(app).projectId)
      }),
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionName } = req.params;
      const { projectId } = req.query;

      const appConnection = (await server.services.appConnection.findAppConnectionByName(
        app,
        {
          connectionName,
          projectId
        },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: appConnection.projectId ?? undefined,
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
      hide: false,
      operationId: `createAppConnection${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
      description: `Create ${startsWithVowel(appName) ? "an" : "a"} ${appName} Connection.`,
      body: createSchema,
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name, method, credentials, description, isPlatformManagedCredentials, gatewayId, projectId } = req.body;

      const appConnection = (await server.services.appConnection.createAppConnection(
        { name, method, app, credentials, description, isPlatformManagedCredentials, gatewayId, projectId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.CREATE_APP_CONNECTION,
          metadata: {
            name,
            method,
            app,
            connectionId: appConnection.id,
            isPlatformManagedCredentials
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
      hide: false,
      operationId: `updateAppConnection${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
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
      const { name, credentials, description, isPlatformManagedCredentials, gatewayId } = req.body;
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.updateAppConnection(
        { name, credentials, connectionId, description, isPlatformManagedCredentials, gatewayId },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: appConnection.projectId ?? undefined,
        event: {
          type: EventType.UPDATE_APP_CONNECTION,
          metadata: {
            name,
            description,
            credentialsUpdated: Boolean(credentials),
            connectionId,
            isPlatformManagedCredentials
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
      hide: false,
      operationId: `deleteAppConnection${appNameForOpId}`,
      tags: [ApiDocsTags.AppConnections],
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
        projectId: appConnection.projectId ?? undefined,
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

  // scott: we will need this once we have individual app connection page and may want to expose to API
  // server.route({
  //   method: "GET",
  //   url: `/:connectionId/usage`,
  //   config: {
  //     rateLimit: readLimit
  //   },
  //   schema: {
  //     hide: true, // scott: we could expose this in the future but just for UI right now
  //     tags: [ApiDocsTags.AppConnections],
  //     params: z.object({
  //       connectionId: z.string().uuid()
  //     }),
  //     response: {
  //       200: z.object({
  //         projects: z
  //           .object({
  //             id: z.string(),
  //             name: z.string(),
  //             type: z.nativeEnum(ProjectType),
  //             slug: z.string(),
  //             resources: z.object({
  //               secretSyncs: z
  //                 .object({
  //                   id: z.string(),
  //                   name: z.string()
  //                 })
  //                 .array(),
  //               secretRotations: z
  //                 .object({
  //                   id: z.string(),
  //                   name: z.string()
  //                 })
  //                 .array(),
  //               externalCas: z
  //                 .object({
  //                   id: z.string(),
  //                   name: z.string()
  //                 })
  //                 .array(),
  //               dataSources: z
  //                 .object({
  //                   id: z.string(),
  //                   name: z.string()
  //                 })
  //                 .array()
  //             })
  //           })
  //           .array()
  //       })
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT]),
  //   handler: async (req) => {
  //     const { connectionId } = req.params;
  //
  //     const projects = await server.services.appConnection.findAppConnectionUsageById(
  //       app,
  //       connectionId,
  //       req.permission
  //     );
  //
  //     await server.services.auditLog.createAuditLog({
  //       ...req.auditLogInfo,
  //       orgId: req.permission.orgId,
  //       event: {
  //         type: EventType.GET_APP_CONNECTION_USAGE,
  //         metadata: {
  //           connectionId
  //         }
  //       }
  //     });
  //
  //     return { projects };
  //   }
  // });
};
