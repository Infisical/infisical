import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { ApplicationIdParamsSchema } from "./pki-application-schemas";
import { PkiSyncSchema } from "./pki-sync-routers/pki-sync-router";

export const registerPkiApplicationSyncRoutes = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/pki-syncs",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationSyncs",
      description: "List PKI syncs for a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      querystring: z.object({
        certificateId: z.string().uuid().optional()
      }),
      response: {
        200: z.object({ syncs: z.array(PkiSyncSchema) })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const syncs = await server.services.pkiSync.listPkiSyncsByProjectId(
        {
          projectId: req.certManagerProjectId,
          certificateId: req.query.certificateId,
          applicationId: req.params.applicationId
        },
        req.permission
      );

      return { syncs };
    }
  });

  server.route({
    method: "GET",
    url: "/:applicationId/pki-syncs/:syncId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplicationSync",
      description: "Get a PKI sync by id for a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        syncId: z.string().uuid()
      }),
      response: { 200: z.object({ sync: PkiSyncSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sync = await server.services.pkiSync.findPkiSyncById(
        {
          id: req.params.syncId,
          projectId: req.certManagerProjectId,
          applicationId: req.params.applicationId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.GET_PKI_SYNC,
          metadata: {
            syncId: sync.id,
            destination: sync.destination,
            applicationId: req.params.applicationId
          }
        }
      });

      return { sync };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/pki-syncs/:syncId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deletePkiApplicationSync",
      description: "Delete a PKI sync from a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        syncId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sync: z.object({
            id: z.string().uuid(),
            name: z.string(),
            projectId: z.string().uuid(),
            destination: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sync = await server.services.pkiSync.deletePkiSync(
        {
          id: req.params.syncId,
          applicationId: req.params.applicationId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sync.projectId,
        event: {
          type: EventType.DELETE_PKI_SYNC,
          metadata: {
            pkiSyncId: sync.id,
            name: sync.name,
            destination: sync.destination,
            applicationId: req.params.applicationId
          }
        }
      });

      return {
        sync: {
          id: sync.id,
          name: sync.name,
          projectId: sync.projectId,
          destination: sync.destination
        }
      };
    }
  });
};
