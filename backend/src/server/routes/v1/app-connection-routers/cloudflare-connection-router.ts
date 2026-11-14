import RE2 from "re2";
import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { CloudflareR2Jurisdiction } from "@app/services/app-connection/cloudflare/cloudflare-connection-enum";
import {
  CreateCloudflareConnectionSchema,
  SanitizedCloudflareConnectionSchema,
  UpdateCloudflareConnectionSchema
} from "@app/services/app-connection/cloudflare/cloudflare-connection-schema";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerCloudflareConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.Cloudflare,
    server,
    sanitizedResponseSchema: SanitizedCloudflareConnectionSchema,
    createSchema: CreateCloudflareConnectionSchema,
    updateSchema: UpdateCloudflareConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use
  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-pages-projects`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflarePagesProjects",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const projects = await server.services.appConnection.cloudflare.listPagesProjects(connectionId, req.permission);
      return projects;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-workers-scripts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflareWorkersScripts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const scripts = await server.services.appConnection.cloudflare.listWorkersScripts(connectionId, req.permission);
      return scripts;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-workers-scripts/:scriptId/previews`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflareWorkersPreviews",
      params: z.object({
        connectionId: z.string().uuid(),
        scriptId: z
          .string()
          .trim()
          .min(1, "Script ID is required")
          .max(64)
          .refine((val) => new RE2(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).test(val), "Invalid script ID format")
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId, scriptId } = req.params;

      const previews = await server.services.appConnection.cloudflare.listWorkersPreviews(
        connectionId,
        scriptId,
        req.permission
      );
      return previews;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-secrets-stores`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflareSecretsStores",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const stores = await server.services.appConnection.cloudflare.listSecretsStores(connectionId, req.permission);
      return stores;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-zones`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflareZones",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const zones = await server.services.appConnection.cloudflare.listZones(connectionId, req.permission);
      return zones;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-permission-groups`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflarePermissionGroups",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            scopes: z.string().array()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const permissionGroups = await server.services.appConnection.cloudflare.listPermissionGroups(
        connectionId,
        req.permission
      );
      return permissionGroups;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/cloudflare-r2-buckets`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listCloudflareR2Buckets",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z
          .object({
            name: z.string(),
            jurisdiction: z.nativeEnum(CloudflareR2Jurisdiction)
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const buckets = await server.services.appConnection.cloudflare.listR2Buckets(connectionId, req.permission);
      return buckets;
    }
  });
};
