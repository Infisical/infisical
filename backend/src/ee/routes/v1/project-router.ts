import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { KmsType } from "@app/services/kms/kms-types";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/kms",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretManagerKmsKey: z.object({
            id: z.string(),
            name: z.string(),
            isExternal: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const kmsKey = await server.services.project.getProjectKmsKeys({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });

      return kmsKey;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/kms",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        kms: z.discriminatedUnion("type", [
          z.object({ type: z.literal(KmsType.Internal) }),
          z.object({ type: z.literal(KmsType.External), kmsId: z.string() })
        ])
      }),
      response: {
        200: z.object({
          secretManagerKmsKey: z.object({
            id: z.string(),
            name: z.string(),
            isExternal: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretManagerKmsKey } = await server.services.project.updateProjectKmsKey({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_PROJECT_KMS,
          metadata: {
            secretManagerKmsKey: {
              id: secretManagerKmsKey.id,
              name: secretManagerKmsKey.name
            }
          }
        }
      });

      return {
        secretManagerKmsKey
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/kms/backup",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretManager: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const backup = await server.services.project.getProjectKmsBackup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.GET_PROJECT_KMS_BACKUP,
          metadata: {}
        }
      });

      return backup;
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/kms/backup",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        backup: z.string().min(1)
      }),
      response: {
        200: z.object({
          secretManagerKmsKey: z.object({
            id: z.string(),
            name: z.string(),
            isExternal: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const backup = await server.services.project.loadProjectKmsBackup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        backup: req.body.backup
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.projectId,
        event: {
          type: EventType.LOAD_PROJECT_KMS_BACKUP,
          metadata: {}
        }
      });

      return backup;
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/migrate-v3",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),

      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const migration = await server.services.secret.startSecretV2Migration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });

      return migration;
    }
  });
};
