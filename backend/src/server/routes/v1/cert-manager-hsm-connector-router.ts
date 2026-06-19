import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import {
  ConnectorIdParamSchema,
  CreateBodySchema,
  HsmConnectorSanitizedSchema,
  HsmConnectorTestResultSchema,
  LinkedCertificatesQuerySchema,
  LinkedCertificatesResponseSchema,
  UpdateBodySchema
} from "./cert-manager-hsm-connector-router-schemas";

export const registerCertManagerHsmConnectorRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createHsmConnector",
      tags: [ApiDocsTags.HsmConnectors],
      body: CreateBodySchema,
      response: { 200: z.object({ hsmConnector: HsmConnectorSanitizedSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hsmConnector = await server.services.hsmConnector.createHsmConnector(
        {
          projectId: req.internalCertManagerProjectId,
          name: req.body.name,
          description: req.body.description,
          gatewayId: req.body.gatewayId,
          gatewayPoolId: req.body.gatewayPoolId,
          credentials: req.body.credentials
        },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: hsmConnector.projectId,
        event: {
          type: EventType.CREATE_HSM_CONNECTOR,
          metadata: {
            connectorId: hsmConnector.id,
            name: hsmConnector.name,
            gatewayId: hsmConnector.gatewayId,
            gatewayPoolId: hsmConnector.gatewayPoolId
          }
        }
      });
      return { hsmConnector };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listHsmConnectors",
      tags: [ApiDocsTags.HsmConnectors],
      response: { 200: z.object({ hsmConnectors: HsmConnectorSanitizedSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hsmConnectors = await server.services.hsmConnector.listHsmConnectors(
        { projectId: req.internalCertManagerProjectId },
        req.permission
      );
      return { hsmConnectors };
    }
  });

  server.route({
    method: "GET",
    url: "/:connectorId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getHsmConnector",
      tags: [ApiDocsTags.HsmConnectors],
      params: ConnectorIdParamSchema,
      response: { 200: z.object({ hsmConnector: HsmConnectorSanitizedSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hsmConnector = await server.services.hsmConnector.getHsmConnectorById(
        { connectorId: req.params.connectorId },
        req.permission
      );
      return { hsmConnector };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:connectorId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateHsmConnector",
      tags: [ApiDocsTags.HsmConnectors],
      params: ConnectorIdParamSchema,
      body: UpdateBodySchema,
      response: { 200: z.object({ hsmConnector: HsmConnectorSanitizedSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hsmConnector = await server.services.hsmConnector.updateHsmConnector(
        {
          connectorId: req.params.connectorId,
          name: req.body.name,
          description: req.body.description,
          gatewayId: req.body.gatewayId ?? undefined,
          gatewayPoolId: req.body.gatewayPoolId ?? undefined,
          credentials: req.body.credentials
        },
        req.permission
      );
      const fieldsUpdated = Object.keys(req.body).filter((k) => req.body[k as keyof typeof req.body] !== undefined);
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: hsmConnector.projectId,
        event: {
          type: EventType.UPDATE_HSM_CONNECTOR,
          metadata: {
            connectorId: hsmConnector.id,
            name: hsmConnector.name,
            fieldsUpdated
          }
        }
      });
      return { hsmConnector };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:connectorId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteHsmConnector",
      tags: [ApiDocsTags.HsmConnectors],
      params: ConnectorIdParamSchema,
      response: { 200: z.object({ id: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const connector = await server.services.hsmConnector.getHsmConnectorById(
        { connectorId: req.params.connectorId },
        req.permission
      );
      const result = await server.services.hsmConnector.deleteHsmConnector(
        { connectorId: req.params.connectorId },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: connector.projectId,
        event: {
          type: EventType.DELETE_HSM_CONNECTOR,
          metadata: { connectorId: result.id, name: connector.name }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:connectorId/test",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "testHsmConnector",
      tags: [ApiDocsTags.HsmConnectors],
      params: ConnectorIdParamSchema,
      response: { 200: HsmConnectorTestResultSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const connector = await server.services.hsmConnector.getHsmConnectorById(
        { connectorId: req.params.connectorId },
        req.permission
      );
      const result = await server.services.hsmConnector.testHsmConnector(
        { connectorId: req.params.connectorId },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: connector.projectId,
        event: {
          type: EventType.TEST_HSM_CONNECTOR,
          metadata: {
            connectorId: req.params.connectorId,
            name: connector.name,
            ok: result.ok,
            memberCount: result.members.length
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:connectorId/linked-certificates",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listHsmConnectorLinkedCertificates",
      tags: [ApiDocsTags.HsmConnectors],
      params: ConnectorIdParamSchema,
      querystring: LinkedCertificatesQuerySchema,
      response: { 200: LinkedCertificatesResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.hsmConnector.listLinkedCertificates(
        {
          connectorId: req.params.connectorId,
          offset: req.query.offset,
          limit: req.query.limit
        },
        req.permission
      );
    }
  });
};
