import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CreateImpervaPkiSyncSchema,
  IMPERVA_PKI_SYNC_LIST_OPTION,
  ImpervaPkiSyncSchema,
  UpdateImpervaPkiSyncSchema
} from "@app/services/pki-sync/imperva";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerImpervaPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) => {
  registerSyncPkiEndpoints({
    destination: PkiSync.Imperva,
    server,
    responseSchema: ImpervaPkiSyncSchema,
    createSchema: CreateImpervaPkiSyncSchema,
    updateSchema: UpdateImpervaPkiSyncSchema,
    syncOptions: {
      canImportCertificates: IMPERVA_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: IMPERVA_PKI_SYNC_LIST_OPTION.canRemoveCertificates,
      canRunHealthCheckCommand: IMPERVA_PKI_SYNC_LIST_OPTION.canRunHealthCheckCommand
    },
    enableOperationId
  });

  server.route({
    method: "GET",
    url: "/sites",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listImpervaSites" } : {}),
      description: "List the websites available on Imperva for the specified connection.",
      querystring: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sites: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              status: z.string().optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { connectionId } = req.query;

      const sites = await server.services.appConnection.imperva.listSites(connectionId, req.permission);

      return { sites };
    }
  });
};
