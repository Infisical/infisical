import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { InternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { KMS } from "@app/lib/api-docs";
import { getBase64SizeInBytes, isBase64 } from "@app/lib/base64";
import { SymmetricEncryption } from "@app/lib/crypto/cipher";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CmekOrderBy } from "@app/services/cmek/cmek-types";

const keyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .toLowerCase()
  .refine((v) => slugify(v) === v, {
    message: "Name must be slug friendly"
  });
const keyDescriptionSchema = z.string().trim().max(500).optional();

const base64Schema = z.string().superRefine((val, ctx) => {
  if (!isBase64(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "plaintext must be base64 encoded"
    });
  }

  if (getBase64SizeInBytes(val) > 4096) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "data cannot exceed 4096 bytes"
    });
  }
});

export const registerCmekRouter = async (server: FastifyZodProvider) => {
  // create encryption key
  server.route({
    method: "POST",
    url: "/keys",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create KMS key",
      body: z.object({
        projectId: z.string().describe(KMS.CREATE_KEY.projectId),
        name: keyNameSchema.describe(KMS.CREATE_KEY.name),
        description: keyDescriptionSchema.describe(KMS.CREATE_KEY.description),
        encryptionAlgorithm: z
          .nativeEnum(SymmetricEncryption)
          .optional()
          .default(SymmetricEncryption.AES_GCM_256)
          .describe(KMS.CREATE_KEY.encryptionAlgorithm) // eventually will support others
      }),
      response: {
        200: z.object({
          key: KmsKeysSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        body: { projectId, name, description, encryptionAlgorithm },
        permission
      } = req;

      const cmek = await server.services.cmek.createCmek(
        { orgId: permission.orgId, projectId, name, description, encryptionAlgorithm },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_CMEK,
          metadata: {
            keyId: cmek.id,
            name,
            description,
            encryptionAlgorithm
          }
        }
      });

      return { key: cmek };
    }
  });

  // update KMS key
  server.route({
    method: "PATCH",
    url: "/keys/:keyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.UPDATE_KEY.keyId)
      }),
      body: z.object({
        name: keyNameSchema.optional().describe(KMS.UPDATE_KEY.name),
        isDisabled: z.boolean().optional().describe(KMS.UPDATE_KEY.isDisabled),
        description: keyDescriptionSchema.describe(KMS.UPDATE_KEY.description)
      }),
      response: {
        200: z.object({
          key: KmsKeysSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body,
        permission
      } = req;

      const cmek = await server.services.cmek.updateCmekById({ keyId, ...body }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: permission.orgId,
        event: {
          type: EventType.UPDATE_CMEK,
          metadata: {
            keyId,
            ...body
          }
        }
      });

      return { key: cmek };
    }
  });

  // delete KMS key
  server.route({
    method: "DELETE",
    url: "/keys/:keyId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.DELETE_KEY.keyId)
      }),
      response: {
        200: z.object({
          key: KmsKeysSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const cmek = await server.services.cmek.deleteCmekById(keyId, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: permission.orgId,
        event: {
          type: EventType.DELETE_CMEK,
          metadata: {
            keyId
          }
        }
      });

      return { key: cmek };
    }
  });

  // list KMS keys
  server.route({
    method: "GET",
    url: "/keys",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List KMS keys",
      querystring: z.object({
        projectId: z.string().describe(KMS.LIST_KEYS.projectId),
        offset: z.coerce.number().min(0).optional().default(0).describe(KMS.LIST_KEYS.offset),
        limit: z.coerce.number().min(1).max(100).optional().default(100).describe(KMS.LIST_KEYS.limit),
        orderBy: z.nativeEnum(CmekOrderBy).optional().default(CmekOrderBy.Name).describe(KMS.LIST_KEYS.orderBy),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .optional()
          .default(OrderByDirection.ASC)
          .describe(KMS.LIST_KEYS.orderDirection),
        search: z.string().trim().optional().describe(KMS.LIST_KEYS.search)
      }),
      response: {
        200: z.object({
          keys: KmsKeysSchema.merge(InternalKmsSchema.pick({ version: true, encryptionAlgorithm: true })).array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId, ...dto },
        permission
      } = req;

      const { cmeks, totalCount } = await server.services.cmek.listCmeksByProjectId({ projectId, ...dto }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_CMEKS,
          metadata: {
            keyIds: cmeks.map((key) => key.id)
          }
        }
      });

      return { keys: cmeks, totalCount };
    }
  });

  // encrypt data
  server.route({
    method: "POST",
    url: "/keys/:keyId/encrypt",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Encrypt data with KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.ENCRYPT.keyId)
      }),
      body: z.object({
        plaintext: base64Schema.describe(KMS.ENCRYPT.plaintext)
      }),
      response: {
        200: z.object({
          ciphertext: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { plaintext },
        permission
      } = req;

      const ciphertext = await server.services.cmek.cmekEncrypt({ keyId, plaintext }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: permission.orgId,
        event: {
          type: EventType.CMEK_ENCRYPT,
          metadata: {
            keyId
          }
        }
      });

      return { ciphertext };
    }
  });

  server.route({
    method: "POST",
    url: "/keys/:keyId/decrypt",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Decrypt data with KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.ENCRYPT.keyId)
      }),
      body: z.object({
        ciphertext: base64Schema.describe(KMS.ENCRYPT.plaintext)
      }),
      response: {
        200: z.object({
          plaintext: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { ciphertext },
        permission
      } = req;

      const plaintext = await server.services.cmek.cmekDecrypt({ keyId, ciphertext }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: permission.orgId,
        event: {
          type: EventType.CMEK_DECRYPT,
          metadata: {
            keyId
          }
        }
      });

      return { plaintext };
    }
  });
};
