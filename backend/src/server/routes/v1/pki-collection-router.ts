import { z } from "zod";

import { PkiCollectionsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPkiCollectionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create PKI collection",
      body: z.object({
        projectId: z.string().trim(),
        name: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.createPkiCollection({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      // TODO: audit logging

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.REVOKE_CERT,
      //       metadata: {
      //         certId: cert.id,
      //         cn: cert.commonName,
      //         serialNumber: cert.serialNumber
      //       }
      //     }
      //   });

      return pkiCollection;
    }
  });

  server.route({
    method: "GET",
    url: "/:collectionId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.getPkiCollectionById({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      // TODO: audit logging

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.GET_CA,
      //       metadata: {
      //         caId: ca.id,
      //         dn: ca.dn
      //       }
      //     }
      //   });

      return pkiCollection;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:collectionId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      body: z.object({
        name: z.string().trim().optional()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.updatePkiCollection({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      // TODO: audit logging

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.GET_CA,
      //       metadata: {
      //         caId: ca.id,
      //         dn: ca.dn
      //       }
      //     }
      //   });

      return pkiCollection;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:collectionId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete PKI collection",
      params: z.object({
        collectionId: z.string().trim()
      }),
      response: {
        200: PkiCollectionsSchema
      }
    },
    handler: async (req) => {
      const pkiCollection = await server.services.pkiCollection.deletePkiCollection({
        collectionId: req.params.collectionId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      // TODO: audit logging

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.DELETE_CERT,
      //       metadata: {
      //         certId: deletedCert.id,
      //         cn: deletedCert.commonName,
      //         serialNumber: deletedCert.serialNumber
      //       }
      //     }
      //   });

      return pkiCollection;
    }
  });
};
