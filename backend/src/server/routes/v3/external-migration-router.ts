import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  ExternalMigrationProviders,
  VaultImportStatus,
  VaultMappingType
} from "@app/services/external-migration/external-migration-types";

const MB25_IN_BYTES = 26214400;

export const registerExternalMigrationRouter = async (server: FastifyZodProvider) => {
  await server.register(fastifyMultipart);

  server.route({
    method: "POST",
    bodyLimit: MB25_IN_BYTES,
    url: "/env-key",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await req.file({
        limits: {
          fileSize: MB25_IN_BYTES
        }
      });

      if (!data) {
        throw new BadRequestError({ message: "No file provided" });
      }

      const fullFile = Buffer.from(await data.toBuffer()).toString("utf8");
      const parsedJsonFile = JSON.parse(fullFile) as { nonce: string; data: string };

      const decryptionKey = (data.fields.decryptionKey as { value: string }).value;

      if (!parsedJsonFile.nonce || !parsedJsonFile.data) {
        throw new BadRequestError({ message: "Invalid file format. Nonce or data missing." });
      }

      if (!decryptionKey) {
        throw new BadRequestError({ message: "Decryption key is required" });
      }

      await server.services.migration.importEnvKeyData({
        decryptionKey,
        encryptedJson: parsedJsonFile,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "POST",
    url: "/vault",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        vaultAccessToken: z.string(),
        vaultNamespace: z.string().trim().optional(),
        vaultUrl: z.string(),
        mappingType: z.nativeEnum(VaultMappingType),
        gatewayId: z.string().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.migration.importVaultData({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        ...req.body
      });
    }
  });

  server.route({
    method: "GET",
    url: "/custom-migration-enabled/:provider",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        provider: z.nativeEnum(ExternalMigrationProviders)
      }),
      response: {
        200: z.object({
          enabled: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const enabled = await server.services.migration.hasCustomVaultMigration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        provider: req.params.provider
      });
      return { enabled };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/configs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          configs: z
            .object({
              id: z.string(),
              orgId: z.string(),
              namespace: z.string(),
              connectionId: z.string().nullish(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const configs = await server.services.migration.getVaultExternalMigrationConfigs({
        actor: req.permission
      });

      return { configs };
    }
  });

  server.route({
    method: "POST",
    url: "/vault/configs",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        connectionId: z.string(),
        namespace: z.string()
      }),
      response: {
        200: z.object({
          config: z.object({
            id: z.string(),
            orgId: z.string(),
            namespace: z.string(),
            connectionId: z.string().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.migration.createVaultExternalMigration({
        ...req.body,
        actor: req.permission
      });

      return { config };
    }
  });

  server.route({
    method: "PUT",
    url: "/vault/configs/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        connectionId: z.string(),
        namespace: z.string()
      }),
      response: {
        200: z.object({
          config: z.object({
            id: z.string(),
            orgId: z.string(),
            namespace: z.string(),
            connectionId: z.string().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.migration.updateVaultExternalMigration({
        id: req.params.id,
        ...req.body,
        actor: req.permission
      });

      return { config };
    }
  });

  server.route({
    method: "DELETE",
    url: "/vault/configs/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          config: z.object({
            id: z.string(),
            orgId: z.string(),
            namespace: z.string(),
            connectionId: z.string().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await server.services.migration.deleteVaultExternalMigration({
        id: req.params.id,
        actor: req.permission
      });

      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/namespaces",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          namespaces: z.array(z.object({ id: z.string(), name: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const namespaces = await server.services.migration.getVaultNamespaces({
        actor: req.permission
      });

      return { namespaces };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/policies",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string()
      }),
      response: {
        200: z.object({
          policies: z.array(z.object({ name: z.string(), rules: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const policies = await server.services.migration.getVaultPolicies({
        actor: req.permission,
        namespace: req.query.namespace
      });

      return { policies };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/mounts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string()
      }),
      response: {
        200: z.object({
          mounts: z.array(z.object({ path: z.string(), type: z.string(), version: z.string().nullish() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mounts = await server.services.migration.getVaultMounts({
        actor: req.permission,
        namespace: req.query.namespace
      });

      return { mounts };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/auth-mounts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string(),
        authType: z.string().optional()
      }),
      response: {
        200: z.object({
          mounts: z.array(z.object({ path: z.string(), type: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const mounts = await server.services.migration.getVaultAuthMounts({
        actor: req.permission,
        namespace: req.query.namespace,
        authType: req.query.authType
      });

      return { mounts };
    }
  });

  server.route({
    method: "POST",
    url: "/vault/import-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectId: z.string(),
        environment: z.string(),
        secretPath: z.string(),
        vaultNamespace: z.string(),
        vaultSecretPath: z.string()
      }),
      response: {
        200: z.object({
          status: z.nativeEnum(VaultImportStatus)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.migration.importVaultSecrets({
        actor: req.permission,
        auditLogInfo: req.auditLogInfo,
        ...req.body
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/vault/kubernetes-roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string(),
        mountPath: z.string()
      }),
      response: {
        200: z.object({
          roles: z.array(
            z.object({
              name: z.string(),
              mountPath: z.string(),
              allowed_kubernetes_namespaces: z.array(z.string()).nullish(),
              allowed_kubernetes_namespace_selector: z.string().nullish(),
              token_max_ttl: z.number().nullish(),
              token_default_ttl: z.number().nullish(),
              token_default_audiences: z.array(z.string()).nullish(),
              service_account_name: z.string().nullish(),
              kubernetes_role_name: z.string().nullish(),
              kubernetes_role_type: z.string().nullish(),
              generated_role_rules: z.string().nullish(),
              name_template: z.string().nullish(),
              extra_annotations: z.record(z.string()).nullish(),
              extra_labels: z.record(z.string()).nullish(),
              config: z.object({
                kubernetes_host: z.string(),
                kubernetes_ca_cert: z.string().nullish()
              })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const roles = await server.services.migration.getVaultKubernetesRoles({
        actor: req.permission,
        namespace: req.query.namespace,
        mountPath: req.query.mountPath
      });

      return { roles };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/database-roles",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string(),
        mountPath: z.string()
      }),
      response: {
        200: z.object({
          roles: z.array(
            z.object({
              name: z.string(),
              mountPath: z.string(),
              db_name: z.string(),
              default_ttl: z.number().nullish(),
              max_ttl: z.number().nullish(),
              creation_statements: z.array(z.string()).nullish(),
              revocation_statements: z.array(z.string()).nullish(),
              renew_statements: z.array(z.string()).nullish(),
              config: z.object({
                connection_details: z.object({
                  connection_url: z.string(),
                  tls_ca: z.string().nullish(),
                  username: z.string().nullish()
                }),
                plugin_name: z.string()
              })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const roles = await server.services.migration.getVaultDatabaseRoles({
        actor: req.permission,
        namespace: req.query.namespace,
        mountPath: req.query.mountPath
      });

      return { roles };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/secret-paths",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string(),
        mountPath: z.string()
      }),
      response: {
        200: z.object({
          secretPaths: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretPaths = await server.services.migration.getVaultSecretPaths({
        actor: req.permission,
        namespace: req.query.namespace,
        mountPath: req.query.mountPath
      });

      return { secretPaths };
    }
  });

  server.route({
    method: "GET",
    url: "/vault/auth-roles/kubernetes",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        namespace: z.string(),
        mountPath: z.string()
      }),

      response: {
        200: z.object({
          roles: z.array(
            z.object({
              name: z.string(),
              mountPath: z.string(),
              bound_service_account_names: z.array(z.string()),
              bound_service_account_namespaces: z.array(z.string()),
              token_ttl: z.number().optional(),
              token_max_ttl: z.number().optional(),
              token_policies: z.array(z.string()).optional(),
              token_bound_cidrs: z.array(z.string()).optional(),
              token_explicit_max_ttl: z.number().optional(),
              token_no_default_policy: z.boolean().optional(),
              token_num_uses: z.number().optional(),
              token_period: z.number().optional(),
              token_type: z.string().optional(),
              audience: z.string().optional(),
              alias_name_source: z.string().optional(),
              config: z.object({
                kubernetes_host: z.string(),
                kubernetes_ca_cert: z.string().optional(),
                issuer: z.string().optional(),
                disable_iss_validation: z.boolean().optional(),
                disable_local_ca_jwt: z.boolean().optional()
              })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const roles = await server.services.migration.getVaultKubernetesAuthRoles({
        actor: req.permission,
        namespace: req.query.namespace,
        mountPath: req.query.mountPath
      });

      return { roles };
    }
  });
};
