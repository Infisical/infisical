import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AppConnections } from "@app/lib/api-docs";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  SanitizedAwsConnectionSchema,
  TAwsConnection,
  UpdateAwsConnectionSchema,
  ValidateAwsConnectionCredentialsSchema
} from "@app/services/app-connection/aws";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const AgentVaultAwsConnectionCreateSchema = ValidateAwsConnectionCredentialsSchema.and(
  z.object({
    name: slugSchema({ field: "name" }).describe(AppConnections.CREATE(AppConnection.AWS).name),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(AppConnections.CREATE(AppConnection.AWS).description)
  })
);

export const registerAgentVaultAppConnectionRouter = async (server: FastifyZodProvider) => {
  // Scoped lookup: without it an org-level connection could be edited or deleted through these routes, and a
  // permission or app refusal would confirm that an id outside Agent Vault exists.
  const $findAgentVaultConnection = async (req: {
    params: { connectionId: string };
    permission: Parameters<typeof server.services.appConnection.findAppConnectionById>[2];
    internalAgentVaultProjectId: string;
  }) =>
    (await server.services.appConnection.findAppConnectionById(
      AppConnection.AWS,
      req.params.connectionId,
      req.permission,
      { projectId: req.internalAgentVaultProjectId }
    )) as TAwsConnection;

  server.route({
    method: "GET",
    url: "/aws",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultAwsAppConnections",
      description: "Lists the AWS connections scoped to Agent Vault",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      response: { 200: z.object({ appConnections: SanitizedAwsConnectionSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnections = (await server.services.appConnection.listAppConnections(
        req.permission,
        AppConnection.AWS,
        req.internalAgentVaultProjectId
      )) as TAwsConnection[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.GET_APP_CONNECTIONS,
          metadata: {
            app: AppConnection.AWS,
            count: appConnections.length,
            connectionIds: appConnections.map((connection) => connection.id),
            connectionNames: appConnections.map((connection) => connection.name)
          }
        }
      });

      return { appConnections };
    }
  });

  server.route({
    method: "POST",
    url: "/aws",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createAgentVaultAwsAppConnection",
      description: "Creates an AWS connection scoped to Agent Vault. Only Agent Vault can use the connection.",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      body: AgentVaultAwsConnectionCreateSchema,
      response: { 200: z.object({ appConnection: SanitizedAwsConnectionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name, method, credentials, description } = req.body;

      const appConnection = (await server.services.appConnection.createAppConnection(
        {
          name,
          method,
          app: AppConnection.AWS,
          credentials,
          description,
          projectId: req.internalAgentVaultProjectId,
          isAutoRotationEnabled: false
        },
        req.permission
      )) as TAwsConnection;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.CREATE_APP_CONNECTION,
          metadata: {
            name,
            method,
            app: AppConnection.AWS,
            connectionId: appConnection.id
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { appConnectionId: appConnection.id, app: AppConnection.AWS, method }
        })
        .catch((err) => logger.error(err, "Failed to send AppConnectionCreated telemetry event"));

      return { appConnection };
    }
  });

  server.route({
    method: "GET",
    url: "/aws/:connectionId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultAwsAppConnection",
      description: "Gets an AWS connection scoped to Agent Vault",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.GET_BY_ID(AppConnection.AWS).connectionId)
      }),
      response: { 200: z.object({ appConnection: SanitizedAwsConnectionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const appConnection = await $findAgentVaultConnection(req);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.GET_APP_CONNECTION,
          metadata: { connectionId: appConnection.id, connectionName: appConnection.name }
        }
      });

      return { appConnection };
    }
  });

  server.route({
    method: "PATCH",
    url: "/aws/:connectionId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateAgentVaultAwsAppConnection",
      description: "Updates an AWS connection scoped to Agent Vault",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.UPDATE(AppConnection.AWS).connectionId)
      }),
      body: UpdateAwsConnectionSchema,
      response: { 200: z.object({ appConnection: SanitizedAwsConnectionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { name, credentials, description } = req.body;
      const { connectionId } = req.params;

      const existing = await $findAgentVaultConnection(req);

      const appConnection = (await server.services.appConnection.updateAppConnection(
        { name, credentials, connectionId, description },
        req.permission
      )) as TAwsConnection;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.UPDATE_APP_CONNECTION,
          metadata: {
            name,
            description,
            credentialsUpdated: Boolean(credentials),
            connectionId,
            connectionName: existing.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { appConnectionId: connectionId, app: AppConnection.AWS }
        })
        .catch((err) => logger.error(err, "Failed to send AppConnectionUpdated telemetry event"));

      return { appConnection };
    }
  });

  server.route({
    method: "DELETE",
    url: "/aws/:connectionId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteAgentVaultAwsAppConnection",
      description:
        "Deletes an AWS connection scoped to Agent Vault. If activity logging uses the connection, switch activity logging to another connection or to none first.",
      tags: [ApiDocsTags.AgentVaultAppConnections],
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.DELETE(AppConnection.AWS).connectionId)
      }),
      response: { 200: z.object({ appConnection: SanitizedAwsConnectionSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { connectionId } = req.params;

      await $findAgentVaultConnection(req);

      const appConnection = (await server.services.appConnection.deleteAppConnection(
        AppConnection.AWS,
        connectionId,
        req.permission
      )) as TAwsConnection;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalAgentVaultProjectId,
        event: {
          type: EventType.DELETE_APP_CONNECTION,
          metadata: { connectionId, connectionName: appConnection.name }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.AppConnectionDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: { appConnectionId: connectionId, app: AppConnection.AWS }
        })
        .catch((err) => logger.error(err, "Failed to send AppConnectionDeleted telemetry event"));

      return { appConnection };
    }
  });
};
