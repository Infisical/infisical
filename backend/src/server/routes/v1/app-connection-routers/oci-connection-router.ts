import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateOCIConnectionSchema,
  SanitizedOCIConnectionSchema,
  UpdateOCIConnectionSchema
} from "@app/services/app-connection/oci";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerOCIConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.OCI,
    server,
    sanitizedResponseSchema: SanitizedOCIConnectionSchema,
    createSchema: CreateOCIConnectionSchema,
    updateSchema: UpdateOCIConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API

  // TODO(andrey): These may need to be changed
  server.route({
    method: "GET",
    url: `/:connectionId/vaults`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid(),
        compartmentOcid: z.string().min(1, "Compartment OCID required")
      }),
      response: {
        200: z
          .object({
            // TODO(andrey): This may need change
            id: z.string(),
            displayName: z.string(),
            compartmentId: z.string(),
            timeCreated: z.string(),
            lifecycleState: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const vaults = await server.services.appConnection.oci.listVaults(req.params, req.permission);
      return vaults;
    }
  });

  server.route({
    method: "GET",
    url: `/:connectionId/vault-keys`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid(),
        compartmentOcid: z.string().min(1, "Compartment OCID required"),
        vaultOcid: z.string().min(1, "Compartment OCID required")
      }),
      response: {
        200: z
          .object({
            // TODO(andrey): This may need change
            id: z.string(),
            displayName: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const vaults = await server.services.appConnection.oci.listVaultKeys(req.params, req.permission);
      return vaults;
    }
  });
};
