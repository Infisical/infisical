import { z } from "zod";

import { ExternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpCredentialSchema,
  ExternalKmsGcpSchema,
  ExternalKmsInputSchema,
  ExternalKmsInputUpdateSchema,
  KmsProviders,
  TExternalKmsGcpCredentialSchema
} from "@app/ee/services/external-kms/providers/model";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedExternalSchema = KmsKeysSchema.extend({
  external: ExternalKmsSchema.pick({
    id: true,
    status: true,
    statusDetails: true,
    provider: true
  })
});

const sanitizedExternalSchemaForGetAll = KmsKeysSchema.pick({
  id: true,
  description: true,
  isDisabled: true,
  createdAt: true,
  updatedAt: true,
  name: true
})
  .extend({
    externalKms: ExternalKmsSchema.pick({
      provider: true,
      status: true,
      statusDetails: true
    })
  })
  .array();

const sanitizedExternalSchemaForGetById = KmsKeysSchema.extend({
  external: ExternalKmsSchema.pick({
    id: true,
    status: true,
    statusDetails: true,
    provider: true
  }).extend({
    // for GCP, we don't return the credential object as it is sensitive data that should not be exposed
    providerInput: z.union([ExternalKmsAwsSchema, ExternalKmsGcpSchema.pick({ gcpRegion: true, keyName: true })])
  })
});

export const registerExternalKmsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        name: z.string().min(1).trim().toLowerCase(),
        description: z.string().trim().optional(),
        provider: ExternalKmsInputSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.name,
        provider: req.body.provider,
        description: req.body.description
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_KMS,
          metadata: {
            kmsId: externalKms.id,
            provider: req.body.provider.type,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { externalKms };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      body: z.object({
        name: z.string().min(1).trim().toLowerCase().optional(),
        description: z.string().trim().optional(),
        provider: ExternalKmsInputUpdateSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.updateById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.name,
        provider: req.body.provider,
        description: req.body.description,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_KMS,
          metadata: {
            kmsId: externalKms.id,
            provider: req.body.provider.type,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { externalKms };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.deleteById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_KMS,
          metadata: {
            kmsId: externalKms.id,
            name: externalKms.name
          }
        }
      });

      return { externalKms };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchemaForGetById
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.findById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_KMS,
          metadata: {
            kmsId: externalKms.id,
            name: externalKms.name
          }
        }
      });

      return { externalKms };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          externalKmsList: sanitizedExternalSchemaForGetAll
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKmsList = await server.services.externalKms.list({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { externalKmsList };
    }
  });

  server.route({
    method: "GET",
    url: "/name/:name",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        name: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchemaForGetById
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const externalKms = await server.services.externalKms.findByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name
      });
      return { externalKms };
    }
  });

  server.route({
    method: "POST",
    url: "/fetch-gcp-keys/credential",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        region: z.string().trim().min(1),
        credential: ExternalKmsGcpCredentialSchema
      }),

      response: {
        200: z.object({
          keys: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { region, credential } = req.body;

      const results = await server.services.externalKms.fetchGcpKeys({
        credential,
        gcpRegion: region,
        keyName: ""
      });
      if (!results) {
        throw new Error("Failed to validate GCP credential");
      }

      return results;
    }
  });
  server.route({
    method: "POST",
    url: "/fetch-gcp-keys/:kmsId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        kmsId: z.string().trim().min(1)
      }),
      body: z.object({
        region: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          keys: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { region } = req.body;
      const { kmsId } = req.params;

      const externalKms = await server.services.externalKms.findById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: kmsId
      });

      if (!externalKms || externalKms.external.provider !== KmsProviders.GCP) {
        throw new Error("KMS not found or not of type GCP");
      }

      const credentialJson = externalKms.external.providerInput.credential as TExternalKmsGcpCredentialSchema;

      const results = await server.services.externalKms.fetchGcpKeys({
        credential: credentialJson,
        gcpRegion: region,
        keyName: ""
      });
      if (!results) {
        throw new Error("Failed to validate GCP credential");
      }

      return results;
    }
  });
};
