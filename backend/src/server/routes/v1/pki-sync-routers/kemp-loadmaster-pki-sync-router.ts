import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  CreateKempLoadMasterPkiSyncSchema,
  KEMP_LOADMASTER_PKI_SYNC_LIST_OPTION,
  KempLoadMasterPkiSyncSchema,
  UpdateKempLoadMasterPkiSyncSchema
} from "@app/services/pki-sync/kemp-loadmaster";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerKempLoadMasterPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) => {
  registerSyncPkiEndpoints({
    destination: PkiSync.KempLoadMaster,
    server,
    responseSchema: KempLoadMasterPkiSyncSchema,
    createSchema: CreateKempLoadMasterPkiSyncSchema,
    updateSchema: UpdateKempLoadMasterPkiSyncSchema,
    syncOptions: {
      canImportCertificates: KEMP_LOADMASTER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: KEMP_LOADMASTER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });

  server.route({
    method: "GET",
    url: "/virtual-services",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listKempLoadMasterVirtualServices" } : {}),
      description: "List the Virtual Services available on the Kemp LoadMaster for the specified connection.",
      querystring: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          virtualServices: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              address: z.string(),
              port: z.number(),
              protocol: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.query;

      const virtualServices = await server.services.appConnection.kempLoadMaster.listVirtualServices(
        connectionId,
        req.permission
      );

      return { virtualServices };
    }
  });
};
