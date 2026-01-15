import z from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateHCVaultConnectionSchema,
  SanitizedHCVaultConnectionSchema,
  UpdateHCVaultConnectionSchema
} from "@app/services/app-connection/hc-vault";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerHCVaultConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.HCVault,
    server,
    sanitizedResponseSchema: SanitizedHCVaultConnectionSchema,
    createSchema: CreateHCVaultConnectionSchema,
    updateSchema: UpdateHCVaultConnectionSchema
  });

  // The following endpoints are for internal Infisical App use only and not part of the public API
  server.route({
    method: "GET",
    url: `/:connectionId/mounts`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listHcVaultMounts",
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.string().array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const mounts = await server.services.appConnection.hcvault.listMounts(connectionId, req.permission);
      return mounts;
    }
  });
};
