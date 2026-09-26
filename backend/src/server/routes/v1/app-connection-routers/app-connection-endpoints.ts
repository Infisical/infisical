import { FastifyRequest } from "fastify";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { InternalServerError } from "@app/lib/errors";
import { startsWithVowel } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { TAppConnection, TAppConnectionInput } from "@app/services/app-connection/app-connection-types";
import { TCreateAppConnectionCredentialRotationSchema } from "@app/services/app-connection/credential-rotation/app-connection-credential-rotation-types";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TProductScopedRoute = "list" | "get" | "create" | "update" | "delete";

// For a product that owns its connections in a project the caller never names (e.g. Agent Vault's implicit
// project): the server supplies the project, by-id routes only reach connections in it, and only the five
// CRUD routes are registered.
type TAppConnectionProductScope = {
  resolveProjectId: (req: FastifyRequest) => string;
  operationIdPrefix: string;
  tags: ApiDocsTags[];
  authModes: AuthMode[];
  descriptions: Record<TProductScopedRoute, string>;
};

export const registerAppConnectionEndpoints = <T extends TAppConnection, I extends TAppConnectionInput>({
  server,
  app,
  createSchema,
  updateSchema,
  sanitizedResponseSchema,
  productScope
}: {
  app: AppConnection;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    method: I["method"];
    credentials: I["credentials"];
    description?: string | null;
    isPlatformManagedCredentials?: boolean;
    isAutoRotationEnabled?: boolean | null;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    projectId?: string;
    rotation?: TCreateAppConnectionCredentialRotationSchema | null;
    configuration?: Record<string, unknown>;
  }>;
  updateSchema: z.ZodType<{
    name?: string;
    credentials?: I["credentials"];
    description?: string | null;
    isPlatformManagedCredentials?: boolean;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    isAutoRotationEnabled?: boolean | null;
    rotation?: Partial<TCreateAppConnectionCredentialRotationSchema> | null;
    configuration?: Record<string, unknown>;
  }>;
  sanitizedResponseSchema: z.ZodTypeAny;
  productScope?: TAppConnectionProductScope;
}) => {
  const appName = APP_CONNECTION_NAME_MAP[app];
  const specialCases: Record<string, string> = {
    [AppConnection.OnePass]: "OnePassword",
    [AppConnection.GitHub]: "GitHub",
    [AppConnection.GitHubRadar]: "GitHubRadar",
    [AppConnection.GitLab]: "GitLab",
    [AppConnection.MsSql]: "MsSql",
    [AppConnection.MySql]: "MySql",
    [AppConnection.OracleDB]: "OracleDb",
    [AppConnection.MongoDB]: "MongoDb",
    [AppConnection.TravisCI]: "TravisCI"
  };
  const appNameForOpId =
    (productScope?.operationIdPrefix ?? "") +
    (specialCases[app] ??
      app
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(""));
  const tags = productScope?.tags ?? [ApiDocsTags.AppConnections];
  const authModes = productScope?.authModes ?? [AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH];

  const $getProductScope = (req: FastifyRequest) => {
    if (!productScope) return undefined;
    const projectId = productScope.resolveProjectId(req);
    if (!projectId) {
      throw new InternalServerError({
        message: `Could not determine which project these ${appName} Connections belong to. Try again, and contact support if it keeps happening.`
      });
    }
    return { projectId };
  };

  // Scoped before any permission or app check, so a connection outside the product reads exactly like a
  // missing one and can't be edited or deleted through the product's routes.
  const $assertInProductScope = async (req: FastifyRequest, connectionId: string) => {
    const scope = $getProductScope(req);
    if (scope) await server.services.appConnection.findAppConnectionById(app, connectionId, req.permission, scope);
  };

  const $listAppConnections = async (req: FastifyRequest, projectId?: string) => {
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
  };

  if (productScope) {
    server.route({
      method: "GET",
      url: `/`,
      config: {
        rateLimit: readLimit
      },
      schema: {
        hide: false,
        operationId: `list${appNameForOpId}AppConnections`,
        tags,
        description: productScope.descriptions.list,
        response: {
          200: z.object({ appConnections: sanitizedResponseSchema.array() })
        }
      },
      onRequest: verifyAuth(authModes),
      handler: async (req) => $listAppConnections(req, $getProductScope(req)?.projectId)
    });
  } else {
    server.route({
      method: "GET",
      url: `/`,
      config: {
        rateLimit: readLimit
      },
      schema: {
        hide: false,
        operationId: `list${appNameForOpId}AppConnections`,
        tags,
        description: `List the ${appName} Connections for the current organization or project.`,
        querystring: z.object({
          projectId: z.string().optional().describe(AppConnections.LIST(app).projectId)
        }),
        response: {
          200: z.object({ appConnections: sanitizedResponseSchema.array() })
        }
      },
      onRequest: verifyAuth(authModes),
      handler: async (req) => $listAppConnections(req, req.query.projectId)
    });
  }

  if (!productScope) {
    server.route({
      method: "GET",
      url: "/available",
      config: {
        rateLimit: readLimit
      },
      schema: {
        hide: false,
        operationId: `list${appNameForOpId}AvailableAppConnections`,
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
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
  }

  server.route({
    method: "GET",
    url: "/:connectionId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `get${appNameForOpId}AppConnection`,
      tags,
      description: productScope?.descriptions.get ?? `Get the specified ${appName} Connection by ID.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.GET_BY_ID(app).connectionId)
      }),
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth(authModes),
    handler: async (req) => {
      const { connectionId } = req.params;

      const appConnection = (await server.services.appConnection.findAppConnectionById(
        app,
        connectionId,
        req.permission,
        $getProductScope(req)
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

  if (!productScope) {
    server.route({
      method: "GET",
      url: `/connection-name/:connectionName`,
      config: {
        rateLimit: readLimit
      },
      schema: {
        hide: false,
        operationId: `get${appNameForOpId}AppConnectionByName`,
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
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
  }

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `create${appNameForOpId}AppConnection`,
      tags,
      description:
        productScope?.descriptions.create ?? `Create ${startsWithVowel(appName) ? "an" : "a"} ${appName} Connection.`,
      body: createSchema,
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth(authModes),
    handler: async (req) => {
      const {
        name,
        method,
        credentials,
        description,
        isPlatformManagedCredentials,
        gatewayId,
        gatewayPoolId,
        isAutoRotationEnabled,
        rotation,
        configuration
      } = req.body;
      const projectId = productScope ? $getProductScope(req)?.projectId : req.body.projectId;

      const appConnection = (await server.services.appConnection.createAppConnection(
        {
          name,
          method,
          app,
          credentials,
          description,
          isPlatformManagedCredentials,
          gatewayId,
          gatewayPoolId,
          projectId,
          rotation,
          isAutoRotationEnabled: isAutoRotationEnabled ?? false,
          configuration
        },
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            appConnectionId: appConnection.id,
            app,
            method: method as string
          }
        })
        .catch((err) => logger.error(err, "Failed to send AppConnectionCreated telemetry event"));

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
      operationId: `update${appNameForOpId}AppConnection`,
      tags,
      description: productScope?.descriptions.update ?? `Update the specified ${appName} Connection.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.UPDATE(app).connectionId)
      }),
      body: updateSchema,
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth(authModes),
    handler: async (req) => {
      const {
        name,
        credentials,
        description,
        isPlatformManagedCredentials,
        gatewayId,
        gatewayPoolId,
        rotation,
        isAutoRotationEnabled,
        configuration
      } = req.body;
      const { connectionId } = req.params;

      await $assertInProductScope(req, connectionId);

      const appConnection = (await server.services.appConnection.updateAppConnection(
        {
          name,
          credentials,
          connectionId,
          description,
          isPlatformManagedCredentials,
          gatewayId,
          gatewayPoolId,
          isAutoRotationEnabled: isAutoRotationEnabled ?? undefined,
          rotation: rotation ?? undefined,
          configuration
        },
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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { appConnectionId: connectionId, app }
        })
        .catch(() => {});

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
      operationId: `delete${appNameForOpId}AppConnection`,
      tags,
      description: productScope?.descriptions.delete ?? `Delete the specified ${appName} Connection.`,
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.DELETE(app).connectionId)
      }),
      response: {
        200: z.object({ appConnection: sanitizedResponseSchema })
      }
    },
    onRequest: verifyAuth(authModes),
    handler: async (req) => {
      const { connectionId } = req.params;

      await $assertInProductScope(req, connectionId);

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

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            appConnectionId: connectionId,
            app
          }
        })
        .catch((err) => logger.error(err, "Failed to send AppConnectionDeleted telemetry event"));

      return { appConnection };
    }
  });

  if (!productScope) {
    server.route({
      method: "POST",
      url: "/:connectionId/rotate-credentials",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: false,
        operationId: `rotate${appNameForOpId}AppConnectionCredentials`,
        tags: [ApiDocsTags.AppConnections],
        description: `Rotate the credentials for the specified ${appName} Connection.`,
        params: z.object({
          connectionId: z.string().uuid().describe(AppConnections.ROTATE_CREDENTIALS(app).connectionId)
        }),
        response: {
          200: z.object({ appConnection: sanitizedResponseSchema })
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
      handler: async (req) => {
        const { connectionId } = req.params;

        await server.services.appConnection.triggerCredentialRotation({ app, connectionId }, req.permission);

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
            type: EventType.ROTATE_APP_CONNECTION_CREDENTIALS,
            metadata: {
              connectionId
            }
          }
        });

        return { appConnection };
      }
    });
  }

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
  //   onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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
