import z from "zod";

import { AppConnections } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreatePaloAltoNetworksConnectionSchema,
  SanitizedPaloAltoNetworksConnectionSchema,
  UpdatePaloAltoNetworksConnectionSchema
} from "@app/services/app-connection/palo-alto-networks";
import { PanOsObjectNameSchema } from "@app/services/app-connection/palo-alto-networks/palo-alto-networks-connection-schemas";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerPaloAltoNetworksConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.PaloAltoNetworks,
    server,
    sanitizedResponseSchema: SanitizedPaloAltoNetworksConnectionSchema,
    createSchema: CreatePaloAltoNetworksConnectionSchema,
    updateSchema: UpdatePaloAltoNetworksConnectionSchema
  });

  server.route({
    method: "GET",
    url: `/:connectionId/templates`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPaloAltoNetworksTemplates",
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.connectionId)
      }),
      response: {
        200: z.object({
          isPanorama: z.boolean().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.isPanorama),
          templates: z.string().array().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.templates)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.appConnection.paloAltoNetworks.listTemplates(
        { connectionId: req.params.connectionId },
        req.permission
      )
  });

  server.route({
    method: "GET",
    url: `/:connectionId/ssl-tls-service-profiles`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listPaloAltoNetworksSslTlsServiceProfiles",
      params: z.object({
        connectionId: z.string().uuid().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.connectionId)
      }),
      querystring: z.object({
        template: PanOsObjectNameSchema("Template")
          .optional()
          .describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.template)
      }),
      response: {
        200: z.object({
          sslTlsServiceProfiles: z
            .object({
              name: z.string().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.profileName),
              vsys: z.string().nullable().describe(AppConnections.PALO_ALTO_NETWORKS_LOOKUPS.profileVsys)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const sslTlsServiceProfiles = await server.services.appConnection.paloAltoNetworks.listSslTlsServiceProfiles(
        { connectionId: req.params.connectionId, template: req.query.template },
        req.permission
      );
      return { sslTlsServiceProfiles };
    }
  });
};
