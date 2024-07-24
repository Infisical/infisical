import { z } from "zod";

import { AuditLogsSchema, SecretSnapshotsSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOGS, PROJECTS } from "@app/lib/api-docs";
import { getLastMidnightDateISO, removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { KmsType } from "@app/services/kms/kms-types";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return project secret snapshots ids",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET_SNAPSHOTS.workspaceId)
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
        projectId: req.params.workspaceId,
        ...req.query
      });
      return { secretSnapshots };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });
      return { count };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/audit-logs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return audit logs",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(AUDIT_LOGS.EXPORT.workspaceId)
      }),
      querystring: z.object({
        eventType: z.nativeEnum(EventType).optional().describe(AUDIT_LOGS.EXPORT.eventType),
        userAgentType: z.nativeEnum(UserAgentType).optional().describe(AUDIT_LOGS.EXPORT.userAgentType),
        startDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.startDate),
        endDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.endDate),
        offset: z.coerce.number().default(0).describe(AUDIT_LOGS.EXPORT.offset),
        limit: z.coerce.number().default(20).describe(AUDIT_LOGS.EXPORT.limit),
        actor: z.string().optional().describe(AUDIT_LOGS.EXPORT.actor)
      }),
      response: {
        200: z.object({
          auditLogs: AuditLogsSchema.omit({
            eventMetadata: true,
            eventType: true,
            actor: true,
            actorMetadata: true
          })
            .merge(
              z.object({
                event: z.object({
                  type: z.string(),
                  metadata: z.any()
                }),
                actor: z.object({
                  type: z.string(),
                  metadata: z.any()
                })
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogs = await server.services.auditLog.listProjectAuditLogs({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.params.workspaceId,
        ...req.query,
        endDate: req.query.endDate,
        startDate: req.query.startDate || getLastMidnightDateISO(),
        auditLogActor: req.query.actor,
        actor: req.permission.type
      });
      return { auditLogs };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/audit-logs/filters/actors",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          actors: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async () => ({ actors: [] })
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/kms",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretManagerKmsKey: z.object({
            id: z.string(),
            slug: z.string(),
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
        projectId: req.params.workspaceId
      });

      return kmsKey;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:workspaceId/kms",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
            slug: z.string(),
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
        projectId: req.params.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.UPDATE_PROJECT_KMS,
          metadata: {
            secretManagerKmsKey: {
              id: secretManagerKmsKey.id,
              slug: secretManagerKmsKey.slug
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
    url: "/:workspaceId/kms/backup",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
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
    url: "/:workspaceId/kms/backup",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        backup: z.string().min(1)
      }),
      response: {
        200: z.object({
          secretManagerKmsKey: z.object({
            id: z.string(),
            slug: z.string(),
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
        projectId: req.params.workspaceId,
        backup: req.body.backup
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
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
    url: "/:workspaceId/migrate-v3",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.params.workspaceId
      });

      return migration;
    }
  });
};
