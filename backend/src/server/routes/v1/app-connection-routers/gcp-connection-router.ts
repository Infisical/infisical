import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateGcpConnectionSchema,
  SanitizedGcpConnectionSchema,
  UpdateGcpConnectionSchema
} from "@app/services/app-connection/gcp";
import { GCP_PROJECT_ID_PATTERN } from "@app/services/app-connection/gcp/gcp-connection-constants";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerGcpConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.GCP,
    server,
    sanitizedResponseSchema: SanitizedGcpConnectionSchema,
    createSchema: CreateGcpConnectionSchema,
    updateSchema: UpdateGcpConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/secret-manager-projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpSecretManagerProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({ id: z.string(), name: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.gcp.listSecretManagerProjects(connectionId, req.permission);

      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/secret-manager-project-locations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpSecretManagerProjectLocations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({ displayName: z.string(), locationId: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { projectId }
      } = req;

      const locations = await server.services.appConnection.gcp.listSecretManagerProjectLocations(
        { connectionId, projectId },
        req.permission
      );

      return locations;
    }
  });
  server.route({
    method: "GET",
    url: `/:connectionId/certificate-manager-projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpCertificateManagerProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({ id: z.string(), name: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.gcp.listCertificateManagerProjects(
        connectionId,
        req.permission
      );

      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/certificate-manager-locations`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpCertificateManagerLocations",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        gcpProjectId: z
          .string()
          .trim()
          .min(6)
          .max(30)
          .refine((value) => GCP_PROJECT_ID_PATTERN.test(value), { message: "Invalid GCP project ID" })
      }),
      response: {
        200: z.object({ locationId: z.string(), displayName: z.string() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { gcpProjectId }
      } = req;

      const locations = await server.services.appConnection.gcp.listCertificateManagerLocations(
        { connectionId, gcpProjectId },
        req.permission
      );

      return locations;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/certificate-maps`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listGcpCertificateMaps",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      querystring: z.object({
        gcpProjectId: z
          .string()
          .trim()
          .min(6)
          .max(30)
          .refine((value) => GCP_PROJECT_ID_PATTERN.test(value), { message: "Invalid GCP project ID" })
      }),
      response: {
        200: z.object({ name: z.string(), description: z.string().optional() }).array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        params: { connectionId },
        query: { gcpProjectId }
      } = req;

      const certificateMaps = await server.services.appConnection.gcp.listCertificateMaps(
        { connectionId, gcpProjectId },
        req.permission
      );

      return certificateMaps;
    }
  });
};
