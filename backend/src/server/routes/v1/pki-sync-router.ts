import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { AzureKeyVaultPkiSyncConfigSchema } from "@app/services/pki-sync/azure-key-vault/azure-key-vault-pki-sync-types";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PkiSyncDetailsSchema, PkiSyncListItemSchema, PkiSyncSchema } from "@app/services/pki-sync/pki-sync-schemas";
import { TCreatePkiSyncDTO, TUpdatePkiSyncDTO } from "@app/services/pki-sync/pki-sync-types";

const CreatePkiSyncRequestBodySchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean().default(true),
  destinationConfig: z
    .discriminatedUnion("destination", [
      z.object({
        destination: z.literal(PkiSync.AzureKeyVault),
        config: AzureKeyVaultPkiSyncConfigSchema
      })
    ])
    .transform(({ config }) => config),
  syncOptions: z.record(z.unknown()).default({}),
  subscriberId: z.string().optional(),
  connectionId: z.string(),
  projectId: z.string().trim().min(1)
});

const UpdatePkiSyncRequestBodySchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().optional(),
  isAutoSyncEnabled: z.boolean().optional(),
  destinationConfig: z.record(z.unknown()).optional(),
  syncOptions: z.record(z.unknown()).optional(),
  subscriberId: z.string().optional(),
  connectionId: z.string().optional()
});

export const registerPkiSyncRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PKI sync options",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: {
          description: "PKI sync options retrieved successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSyncOptions: z.array(
                  z.object({
                    name: z.string(),
                    destination: z.nativeEnum(PkiSync),
                    canImportCertificates: z.boolean(),
                    canRemoveCertificates: z.boolean(),
                    enterprise: z.boolean().optional()
                  })
                )
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async () => {
      const pkiSyncOptions = [
        {
          name: "Azure Key Vault",
          destination: PkiSync.AzureKeyVault,
          canImportCertificates: true,
          canRemoveCertificates: true,
          enterprise: false
        }
      ];

      return { pkiSyncOptions };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Create PKI sync",
      security: [
        {
          bearerAuth: []
        }
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: CreatePkiSyncRequestBodySchema
          }
        }
      },
      response: {
        200: {
          description: "PKI sync created successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSync: PkiSyncSchema
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const requestBody = CreatePkiSyncRequestBodySchema.parse(req.body);
      const createData: Omit<TCreatePkiSyncDTO, "auditLogInfo"> = requestBody;

      try {
        const pkiSync = await server.services.pkiSync.createPkiSync(createData, req.permission);

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: createData.projectId,
          event: {
            type: EventType.CREATE_PKI_SYNC,
            metadata: {
              pkiSyncId: pkiSync.id,
              name: pkiSync.name,
              destination: pkiSync.destination
            }
          }
        });

        return { pkiSync };
      } catch (error) {
        logger.error("Failed to create PKI sync");
        logger.error(error);
        throw error;
      }
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PKI syncs",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI syncs retrieved successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSyncs: z.array(PkiSyncListItemSchema)
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const pkiSyncs = await server.services.pkiSync.listPkiSyncsByProjectId(
        {
          projectId: req.query.projectId
        },
        req.permission
      );

      return { pkiSyncs };
    }
  });

  server.route({
    method: "GET",
    url: "/:pkiSyncId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PKI sync by ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI sync retrieved successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSync: PkiSyncDetailsSchema
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const pkiSync = await server.services.pkiSync.findPkiSyncById(
        {
          id: req.params.pkiSyncId,
          projectId: req.query.projectId
        },
        req.permission
      );

      return { pkiSync };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:pkiSyncId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Update PKI sync",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      requestBody: {
        content: {
          "application/json": {
            schema: UpdatePkiSyncRequestBodySchema
          }
        }
      },
      response: {
        200: {
          description: "PKI sync updated successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSync: PkiSyncSchema
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      const requestBody = UpdatePkiSyncRequestBodySchema.parse(req.body);
      const updateData: Omit<TUpdatePkiSyncDTO, "auditLogInfo"> = {
        id: req.params.pkiSyncId,
        projectId: req.query.projectId,
        ...requestBody
      };

      try {
        const pkiSync = await server.services.pkiSync.updatePkiSync(updateData, req.permission);

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.query.projectId,
          event: {
            type: EventType.UPDATE_PKI_SYNC,
            metadata: {
              pkiSyncId: pkiSync.id,
              name: pkiSync.name
            }
          }
        });

        return { pkiSync };
      } catch (error) {
        logger.error("Failed to update PKI sync");
        logger.error(error);
        throw error;
      }
    }
  });

  server.route({
    method: "DELETE",
    url: "/:pkiSyncId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Delete PKI sync",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI sync deleted successfully",
          content: {
            "application/json": {
              schema: z.object({
                pkiSync: z.object({
                  id: z.string(),
                  name: z.string(),
                  destination: z.nativeEnum(PkiSync)
                })
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      try {
        const pkiSync = await server.services.pkiSync.deletePkiSync(
          {
            id: req.params.pkiSyncId,
            projectId: req.query.projectId
          },
          req.permission
        );

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: req.query.projectId,
          event: {
            type: EventType.DELETE_PKI_SYNC,
            metadata: {
              pkiSyncId: pkiSync.id,
              name: pkiSync.name,
              destination: pkiSync.destination
            }
          }
        });

        return { pkiSync };
      } catch (error) {
        logger.error("Failed to delete PKI sync");
        logger.error(error);
        throw error;
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/sync",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Trigger PKI sync",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI sync triggered successfully",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string()
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      try {
        const result = await server.services.pkiSync.triggerPkiSyncSyncCertificatesById(
          {
            id: req.params.pkiSyncId,
            projectId: req.query.projectId
          },
          req.permission
        );

        return result;
      } catch (error) {
        logger.error("Failed to trigger PKI sync");
        logger.error(error);
        throw error;
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/import",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Import certificates from PKI sync destination",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI sync import triggered successfully",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string()
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      try {
        const result = await server.services.pkiSync.triggerPkiSyncImportCertificatesById(
          {
            id: req.params.pkiSyncId,
            projectId: req.query.projectId
          },
          req.permission
        );

        return result;
      } catch (error) {
        logger.error("Failed to trigger PKI sync import certificates");
        logger.error(error);
        throw error;
      }
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/remove",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Remove certificates from PKI sync destination",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        pkiSyncId: z.string()
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: {
          description: "PKI sync remove triggered successfully",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string()
              })
            }
          }
        }
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req) => {
      try {
        const result = await server.services.pkiSync.triggerPkiSyncRemoveCertificatesById(
          {
            id: req.params.pkiSyncId,
            projectId: req.query.projectId
          },
          req.permission
        );

        return result;
      } catch (error) {
        logger.error("Failed to trigger PKI sync remove certificates");
        logger.error(error);
        throw error;
      }
    }
  });
};
