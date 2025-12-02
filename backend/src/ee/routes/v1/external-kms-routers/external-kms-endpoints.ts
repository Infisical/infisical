import { z } from "zod";

import { ExternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ExternalKmsAwsSchema,
  ExternalKmsGcpSchema,
  KmsProviders,
  TExternalKmsInputSchema,
  TExternalKmsInputUpdateSchema
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

export const registerExternalKmsEndpoints = <
  T extends { type: KmsProviders; inputs: TExternalKmsInputSchema["inputs"] }
>({
  server,
  provider,
  createSchema,
  updateSchema
}: {
  server: FastifyZodProvider;
  provider: T["type"];
  createSchema: z.ZodType<T["inputs"]>;
  updateSchema: z.ZodType<Partial<T["inputs"]>>;
}) => {
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

      // Validate that the KMS is of the expected provider type
      if (externalKms.external.provider !== provider) {
        throw new Error(`KMS provider mismatch. Expected ${provider}, got ${externalKms.external.provider}`);
      }

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
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        name: z.string().min(1).trim().toLowerCase(),
        description: z.string().trim().optional(),
        provider: createSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        name,
        description,
        provider: providerInputs
      } = req.body as {
        name: string;
        description?: string;
        provider: T["inputs"];
      };

      const providerInput = {
        type: provider,
        inputs: providerInputs
      } as TExternalKmsInputSchema;

      const externalKms = await server.services.externalKms.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name,
        provider: providerInput,
        description
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_KMS,
          metadata: {
            kmsId: externalKms.id,
            provider,
            name,
            description
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
        provider: updateSchema
      }),
      response: {
        200: z.object({
          externalKms: sanitizedExternalSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        name,
        description,
        provider: providerInputs
      } = req.body as {
        name?: string;
        description?: string;
        provider: Partial<T["inputs"]>;
      };

      const providerInput = {
        type: provider,
        inputs: providerInputs
      } as TExternalKmsInputUpdateSchema;

      const externalKms = await server.services.externalKms.updateById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name,
        provider: providerInput,
        description,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_KMS,
          metadata: {
            kmsId: externalKms.id,
            provider,
            name,
            description
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

      // Validate that the KMS is of the expected provider type
      if (externalKms.external.provider !== provider) {
        throw new Error(`KMS provider mismatch. Expected ${provider}, got ${externalKms.external.provider}`);
      }

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
};
