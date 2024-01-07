import { z } from "zod";

import { SecretImportsSchema, SecretsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretImportRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/"),
        import: z.object({
          environment: z.string().trim(),
          path: z.string().trim()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.createImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        data: req.body.import
      });
      return { message: "Successfully created secret import", secretImport };
    }
  });

  server.route({
    url: "/:secretImportId",
    method: "PATCH",
    schema: {
      params: z.object({
        secretImportId: z.string().trim()
      }),
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/"),
        import: z.object({
          environment: z.string().trim().optional(),
          path: z.string().trim().optional(),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.updateImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.secretImportId,
        ...req.body,
        data: req.body.import
      });
      return { message: "Successfully updated secret import", secretImport };
    }
  });

  server.route({
    url: "/:secretImportId",
    method: "DELETE",
    schema: {
      params: z.object({
        secretImportId: z.string().trim()
      }),
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/")
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secretImport = await server.services.secretImport.deleteImport({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.secretImportId,
        ...req.body
      });
      return { message: "Successfully deleted secret import", secretImport };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/")
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secretImports = await server.services.secretImport.getImports({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.query
      });
      return { message: "Successfully fetched secret imports", secretImports };
    }
  });

  server.route({
    url: "/secrets",
    method: "GET",
    schema: {
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          secrets: z
            .object({
              secretPath: z.string(),
              environment: z.object({
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const importedSecrets = await server.services.secretImport.getSecretsFromImports({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.query
      });
      return { secrets: importedSecrets };
    }
  });
};
