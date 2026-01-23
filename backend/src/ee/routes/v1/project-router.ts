import { z } from "zod";

import { SecretSnapshotsSchema } from "@app/db/schemas/secret-snapshots";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { KmsType } from "@app/services/kms/kms-types";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/secret-snapshots",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Return project secret snapshots ids",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.GET_SNAPSHOTS.projectId)
      }),
      querystring: z.object({
        environment: z.string().trim().describe(PROJECTS.GET_SNAPSHOTS.environment),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(PROJECTS.GET_SNAPSHOTS.path),
        offset: z.coerce.number().default(0).describe(PROJECTS.GET_SNAPSHOTS.offset),
        limit: z.coerce.number().default(20).describe(PROJECTS.GET_SNAPSHOTS.limit)
      }),
      response: {
        200: z.object({
          secretSnapshots: SecretSnapshotsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretSnapshots = await server.services.snapshot.listSnapshots({
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        ...req.query
      });
      return { secretSnapshots };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secret-snapshots/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          count: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const count = await server.services.snapshot.projectSecretSnapshotCount({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        environment: req.query.environment,
        path: req.query.path
      });
      return { count };
    }
  });

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
