import { z } from "zod";

import { SecretImportsSchema, SecretsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretImportRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      description: "Create secret imports",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        import: z.object({
          environment: z.string().trim(),
          path: z.string().trim().transform(removeTrailingSlash)
        })
      }),
      response: {
        200: z.object({
          message: z.string(),
          secretImport: SecretImportsSchema.omit({ importEnv: true }).merge(
            z.object({
              importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.createImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId,
        data: req.body.import
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.CREATE_SECRET_IMPORT,
          metadata: {
            secretImportId: secretImport.id,
            folderId: secretImport.folderId,
            importFromSecretPath: secretImport.importPath,
            importFromEnvironment: secretImport.importEnv.slug,
            importToEnvironment: req.body.environment,
            importToSecretPath: req.body.path
          }
        }
      });
      return { message: "Successfully created secret import", secretImport };
    }
  });

  server.route({
    url: "/:secretImportId",
    method: "PATCH",
    schema: {
      description: "Update secret imports",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        secretImportId: z.string().trim()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        import: z.object({
          environment: z.string().trim().optional(),
          path: z
            .string()
            .trim()
            .optional()
            .transform((val) => (val ? removeTrailingSlash(val) : val)),
          position: z.number().optional()
        })
      }),
      response: {
        200: z.object({
          message: z.string(),
          secretImport: SecretImportsSchema.omit({ importEnv: true }).merge(
            z.object({
              importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.updateImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        id: req.params.secretImportId,
        ...req.body,
        projectId: req.body.workspaceId,
        data: req.body.import
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.UPDATE_SECRET_IMPORT,
          metadata: {
            secretImportId: secretImport.id,
            folderId: secretImport.folderId,
            position: secretImport.position,
            importToEnvironment: req.body.environment,
            importToSecretPath: req.body.path
          }
        }
      });

      return { message: "Successfully updated secret import", secretImport };
    }
  });

  server.route({
    url: "/:secretImportId",
    method: "DELETE",
    schema: {
      description: "Delete secret imports",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        secretImportId: z.string().trim()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          message: z.string(),
          secretImport: SecretImportsSchema.omit({ importEnv: true }).merge(
            z.object({
              importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.deleteImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        id: req.params.secretImportId,
        ...req.body,
        projectId: req.body.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.DELETE_SECRET_IMPORT,
          metadata: {
            secretImportId: secretImport.id,
            folderId: secretImport.folderId,
            importFromEnvironment: secretImport.importEnv.slug,
            importFromSecretPath: secretImport.importPath,
            importToEnvironment: req.body.environment,
            importToSecretPath: req.body.path
          }
        }
      });
      return { message: "Successfully deleted secret import", secretImport };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      description: "Get secret imports",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          message: z.string(),
          secretImports: SecretImportsSchema.omit({ importEnv: true })
            .merge(
              z.object({
                importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() })
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretImports = await server.services.secretImport.getImports({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
        event: {
          type: EventType.GET_SECRET_IMPORTS,
          metadata: {
            environment: req.query.environment,
            folderId: secretImports?.[0]?.folderId,
            numberOfImports: secretImports.length
          }
        }
      });
      return { message: "Successfully fetched secret imports", secretImports };
    }
  });

  server.route({
    url: "/secrets",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          secrets: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              environmentInfo: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              }),
              folderId: z.string().optional(),
              secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const importedSecrets = await server.services.secretImport.getSecretsFromImports({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId
      });
      return { secrets: importedSecrets };
    }
  });
};
