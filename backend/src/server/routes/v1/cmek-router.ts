import { z } from "zod";

import { InternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, KMS } from "@app/lib/api-docs";
import { getBase64SizeInBytes, isBase64 } from "@app/lib/base64";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CmekOrderBy, TCmekKeyEncryptionAlgorithm } from "@app/services/cmek/cmek-types";
import { KmsKeyUsage } from "@app/services/kms/kms-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const keyNameSchema = slugSchema({ min: 1, max: 32, field: "Name" });
const keyDescriptionSchema = z.string().trim().max(500).optional();

const AllowedKmsKeyAlgorithms = [
  ...Object.values(SymmetricKeyAlgorithm),
  ...Object.values(AsymmetricKeyAlgorithm),
  ...Object.values(HmacAlgorithm)
] as [string, ...string[]];

const CmekSchema = KmsKeysSchema.merge(InternalKmsSchema.pick({ version: true, encryptionAlgorithm: true }))
  .omit({
    isReserved: true
  })
  .extend({ algorithm: z.string(), encryptionAlgorithm: z.string().describe(openApiHidden()) });

const withAlgorithmAlias = <T extends { encryptionAlgorithm: string }>(key: T) => ({
  ...key,
  algorithm: key.encryptionAlgorithm
});

const MAX_KMS_PAYLOAD_BYTES = 1024 * 1024;
// AES-GCM ciphertext carries a 12-byte IV, 16-byte auth tag, and 3-byte version blob on top of the plaintext,
// so the decrypt limit must exceed the encrypt limit or a max-size encrypt's output can't be decrypted.
const MAX_KMS_CIPHERTEXT_BYTES = MAX_KMS_PAYLOAD_BYTES + 1024;
const MAX_KMS_SIGNATURE_BYTES = 8192;
// A 1MB payload is ~1.37MB once base64 encoded, plus the JSON envelope, so the raw request body exceeds
// Fastify's 1MB default bodyLimit. Override per-route so the body isn't rejected before schema validation runs.
const KMS_PAYLOAD_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

const createBase64Schema = (field: string, maxBytes: number) =>
  z.string().superRefine((val, ctx) => {
    if (!isBase64(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} must be base64 encoded`
      });
    }

    if (getBase64SizeInBytes(val) > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} cannot exceed ${maxBytes} bytes`
      });
    }
  });

const base64Schema = createBase64Schema("data", MAX_KMS_PAYLOAD_BYTES);
const ciphertextBase64Schema = createBase64Schema("ciphertext", MAX_KMS_CIPHERTEXT_BYTES);
const signatureBase64Schema = createBase64Schema("signature", MAX_KMS_SIGNATURE_BYTES);
const macBase64Schema = createBase64Schema("mac", 1024);

export const registerCmekRouter = async (server: FastifyZodProvider) => {
  // create encryption key
  server.route({
    method: "POST",
    url: "/keys",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createKmsKey",
      tags: [ApiDocsTags.KmsKeys],
      description: "Create KMS key",
      body: z
        .object({
          projectId: z.string().describe(KMS.CREATE_KEY.projectId),
          name: keyNameSchema.describe(KMS.CREATE_KEY.name),
          description: keyDescriptionSchema.describe(KMS.CREATE_KEY.description),
          keyUsage: z
            .nativeEnum(KmsKeyUsage)
            .optional()
            .default(KmsKeyUsage.ENCRYPT_DECRYPT)
            .describe(KMS.CREATE_KEY.type),
          algorithm: z.enum(AllowedKmsKeyAlgorithms).optional().describe(KMS.CREATE_KEY.algorithm),
          // Deprecated alias for `algorithm`, retained for backwards compatibility.
          encryptionAlgorithm: z.enum(AllowedKmsKeyAlgorithms).optional().describe(openApiHidden()),
          isExportable: z.boolean().optional().default(true).describe(KMS.CREATE_KEY.isExportable)
        })
        .superRefine((data, ctx) => {
          const algorithm = data.algorithm ?? data.encryptionAlgorithm ?? SymmetricKeyAlgorithm.AES_GCM_256;
          if (
            data.keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT &&
            !Object.values(SymmetricKeyAlgorithm).includes(algorithm as SymmetricKeyAlgorithm)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `algorithm must be a valid symmetric encryption algorithm. Valid options are: ${Object.values(
                SymmetricKeyAlgorithm
              ).join(", ")}`
            });
          }
          if (
            data.keyUsage === KmsKeyUsage.SIGN_VERIFY &&
            !Object.values(AsymmetricKeyAlgorithm).includes(algorithm as AsymmetricKeyAlgorithm)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `algorithm must be a valid asymmetric sign-verify algorithm. Valid options are: ${Object.values(
                AsymmetricKeyAlgorithm
              ).join(", ")}`
            });
          }
          if (
            data.keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC &&
            !Object.values(HmacAlgorithm).includes(algorithm as HmacAlgorithm)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `algorithm must be a valid HMAC algorithm. Valid options are: ${Object.values(
                HmacAlgorithm
              ).join(", ")}`
            });
          }
        }),
      response: {
        200: z.object({
          key: CmekSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        body: { projectId, name, description, keyUsage, isExportable },
        permission
      } = req;

      const algorithm = (req.body.algorithm ??
        req.body.encryptionAlgorithm ??
        SymmetricKeyAlgorithm.AES_GCM_256) as TCmekKeyEncryptionAlgorithm;

      const cmek = await server.services.cmek.createCmek(
        {
          orgId: permission.orgId,
          projectId,
          name,
          description,
          encryptionAlgorithm: algorithm,
          keyUsage,
          isExportable
        },
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
            encryptionAlgorithm: algorithm,
            isExportable
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.CmekCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: permission.orgId,
          properties: {
            keyId: cmek.id,
            projectId,
            encryptionAlgorithm: algorithm,
            keyUsage
          }
        })
        .catch(() => {});

      return { key: withAlgorithmAlias(cmek) };
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
      hide: false,
      operationId: "updateKmsKey",
      tags: [ApiDocsTags.KmsKeys],
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
          key: CmekSchema
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
        projectId: cmek.projectId!,
        event: {
          type: EventType.UPDATE_CMEK,
          metadata: {
            keyId,
            ...body
          }
        }
      });

      return { key: withAlgorithmAlias(cmek) };
    }
  });

  server.route({
    method: "POST",
    url: "/keys/:keyId/rotate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "rotateKmsKey",
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Rotate KMS key. Generates new key material for the key and increments its version. Previous key material is retained so existing ciphertexts remain decryptable; new encrypt operations use the new material. Only supported for encrypt-decrypt keys.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.ROTATE_KEY.keyId)
      }),
      response: {
        200: z.object({
          key: CmekSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const cmek = await server.services.cmek.rotateCmekById(keyId, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: cmek.projectId!,
        event: {
          type: EventType.ROTATE_CMEK,
          metadata: {
            keyId,
            version: cmek.version
          }
        }
      });

      return { key: withAlgorithmAlias(cmek) };
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
      hide: false,
      operationId: "deleteKmsKey",
      tags: [ApiDocsTags.KmsKeys],
      description: "Delete KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.DELETE_KEY.keyId)
      }),
      response: {
        200: z.object({
          key: CmekSchema
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
        projectId: cmek.projectId!,
        event: {
          type: EventType.DELETE_CMEK,
          metadata: {
            keyId
          }
        }
      });

      return { key: withAlgorithmAlias(cmek) };
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
      hide: false,
      operationId: "listKmsKeys",
      tags: [ApiDocsTags.KmsKeys],
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
          keys: CmekSchema.array(),
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

      return { keys: cmeks.map(withAlgorithmAlias), totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/keys/:keyId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getKmsKeyById",
      tags: [ApiDocsTags.KmsKeys],
      description: "Get KMS key by ID",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.GET_KEY_BY_ID.keyId)
      }),
      response: {
        200: z.object({
          key: CmekSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const key = await server.services.cmek.findCmekById(keyId, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: key.projectId!,
        event: {
          type: EventType.GET_CMEK,
          metadata: {
            keyId: key.id
          }
        }
      });

      return { key: withAlgorithmAlias(key) };
    }
  });

  server.route({
    method: "GET",
    url: "/keys/key-name/:keyName",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getKmsKeyByName",
      tags: [ApiDocsTags.KmsKeys],
      description: "Get KMS key by name",
      params: z.object({
        keyName: slugSchema({ field: "Key name" }).describe(KMS.GET_KEY_BY_NAME.keyName)
      }),
      querystring: z.object({
        projectId: z.string().min(1, "Project ID is required").describe(KMS.GET_KEY_BY_NAME.projectId)
      }),
      response: {
        200: z.object({
          key: CmekSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyName },
        query: { projectId },
        permission
      } = req;

      const key = await server.services.cmek.findCmekByName(keyName, projectId, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: key.projectId!,
        event: {
          type: EventType.GET_CMEK,
          metadata: {
            keyId: key.id
          }
        }
      });

      return { key: withAlgorithmAlias(key) };
    }
  });

  // encrypt data
  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/encrypt",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "encryptWithKmsKey",
      tags: [ApiDocsTags.KmsEncryption],
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

      const { ciphertext, projectId } = await server.services.cmek.cmekEncrypt({ keyId, plaintext }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_ENCRYPT,
          metadata: {
            keyId
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.CmekEncrypt,
          distinctId: getTelemetryDistinctId(req),
          organizationId: permission.orgId,
          properties: { keyId, projectId }
        })
        .catch(() => {});

      return { ciphertext };
    }
  });

  server.route({
    method: "GET",
    url: "/keys/:keyId/public-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getKmsKeyPublicKey",
      tags: [ApiDocsTags.KmsSigning],
      description:
        "Get the public key for a KMS key that is used for signing and verifying data. This endpoint is only available for asymmetric keys.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.GET_PUBLIC_KEY.keyId)
      }),
      response: {
        200: z.object({
          publicKey: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const { publicKey, projectId, keyName } = await server.services.cmek.getPublicKey({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_GET_PUBLIC_KEY,
          metadata: {
            keyId,
            keyName
          }
        }
      });

      return { publicKey };
    }
  });

  server.route({
    method: "GET",
    url: "/keys/:keyId/private-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getKmsKeyPrivateKey",
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Export the private key (or key material) for a KMS key. For asymmetric keys (sign/verify), the private key is returned. For symmetric keys (encrypt/decrypt), the key material is returned.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.GET_PRIVATE_KEY.keyId)
      }),
      response: {
        200: z.object({
          privateKey: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const { privateKey, projectId, keyName } = await server.services.cmek.getPrivateKey({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_GET_PRIVATE_KEY,
          metadata: {
            keyId,
            keyName
          }
        }
      });

      return { privateKey };
    }
  });

  server.route({
    method: "POST",
    url: "/keys/bulk-import",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "bulkImportKmsKeys",
      tags: [ApiDocsTags.KmsKeys],
      description: "Bulk import KMS keys with provided key material into a project.",
      body: z.object({
        projectId: z.string().uuid(),
        keys: z
          .array(
            z
              .object({
                name: keyNameSchema,
                keyUsage: z.nativeEnum(KmsKeyUsage),
                algorithm: z.enum(AllowedKmsKeyAlgorithms).optional(),
                // Deprecated alias for `algorithm`, retained for backwards compatibility.
                encryptionAlgorithm: z.enum(AllowedKmsKeyAlgorithms).optional().describe(openApiHidden()),
                keyMaterial: z.string().min(1),
                isExportable: z.boolean().optional().default(true).describe(KMS.CREATE_KEY.isExportable)
              })
              .superRefine((data, ctx) => {
                const algorithm = data.algorithm ?? data.encryptionAlgorithm;
                if (!algorithm) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["algorithm"],
                    message: "algorithm is required"
                  });
                  return;
                }
                if (
                  data.keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT &&
                  !Object.values(SymmetricKeyAlgorithm).includes(algorithm as SymmetricKeyAlgorithm)
                ) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `algorithm must be a symmetric algorithm for encrypt-decrypt keys`
                  });
                }
                if (
                  data.keyUsage === KmsKeyUsage.SIGN_VERIFY &&
                  !Object.values(AsymmetricKeyAlgorithm).includes(algorithm as AsymmetricKeyAlgorithm)
                ) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `algorithm must be an asymmetric algorithm for sign-verify keys`
                  });
                }
                if (
                  data.keyUsage === KmsKeyUsage.GENERATE_VERIFY_MAC &&
                  !Object.values(HmacAlgorithm).includes(algorithm as HmacAlgorithm)
                ) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `algorithm must be an HMAC algorithm for generate-verify-mac keys`
                  });
                }
                if (!isBase64(data.keyMaterial)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["keyMaterial"],
                    message: "keyMaterial must be base64 encoded"
                  });
                }
              })
          )
          .min(1)
          .max(100)
      }),
      response: {
        200: z.object({
          keys: z.array(z.object({ id: z.string(), name: z.string() })),
          errors: z.array(z.object({ name: z.string(), message: z.string() }))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        body: { projectId, keys },
        permission
      } = req;

      const { keys: importedKeys, errors } = await server.services.cmek.bulkImportKeys(
        {
          projectId,
          keys: keys.map((k) => ({
            name: k.name,
            algorithm: (k.algorithm ?? k.encryptionAlgorithm)! as TCmekKeyEncryptionAlgorithm,
            keyUsage: k.keyUsage,
            keyMaterial: k.keyMaterial,
            isExportable: k.isExportable
          }))
        },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_BULK_IMPORT_KEYS,
          metadata: {
            keyNames: importedKeys.map((k) => k.name),
            failedKeyNames: errors.map((e) => e.name),
            projectId
          }
        }
      });

      return { keys: importedKeys, errors };
    }
  });

  server.route({
    method: "POST",
    url: "/keys/bulk-export-private-keys",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "bulkExportKmsKeyPrivateKeys",
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Bulk export multiple KMS keys. For asymmetric keys (sign/verify), both private and public keys are returned. For symmetric keys (encrypt/decrypt), the key material is returned.",
      body: z.object({
        keyIds: z.array(z.string().uuid().describe(KMS.BULK_EXPORT_PRIVATE_KEYS.keyIds)).min(1).max(100)
      }),
      response: {
        200: z.object({
          keys: z.array(
            z.object({
              keyId: z.string(),
              name: z.string(),
              keyUsage: z.string(),
              algorithm: z.string(),
              privateKey: z.string(),
              publicKey: z.string().optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        body: { keyIds },
        permission
      } = req;

      const { keys, projectId } = await server.services.cmek.bulkGetPrivateKeys({ keyIds }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_BULK_EXPORT_PRIVATE_KEYS,
          metadata: {
            keys: keys.map((k) => ({ keyId: k.keyId, name: k.name }))
          }
        }
      });

      return { keys };
    }
  });

  server.route({
    method: "GET",
    url: "/keys/:keyId/signing-algorithms",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listKmsKeySigningAlgorithms",
      tags: [ApiDocsTags.KmsSigning],
      description: "List all available signing algorithms for a KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.LIST_SIGNING_ALGORITHMS.keyId)
      }),
      response: {
        200: z.object({
          signingAlgorithms: z.array(z.nativeEnum(SigningAlgorithm))
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { keyId } = req.params;

      const { signingAlgorithms, projectId } = await server.services.cmek.listSigningAlgorithms(
        { keyId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_LIST_SIGNING_ALGORITHMS,
          metadata: {
            keyId
          }
        }
      });

      return { signingAlgorithms };
    }
  });

  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/sign",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "signWithKmsKey",
      tags: [ApiDocsTags.KmsSigning],
      description: "Sign data with a KMS key.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.SIGN.keyId)
      }),
      body: z.object({
        signingAlgorithm: z.nativeEnum(SigningAlgorithm),
        isDigest: z.boolean().optional().default(false).describe(KMS.SIGN.isDigest),
        data: base64Schema.describe(KMS.SIGN.data)
      }),
      response: {
        200: z.object({
          signature: z.string(),
          keyId: z.string().uuid(),
          signingAlgorithm: z.nativeEnum(SigningAlgorithm)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId: inputKeyId },
        body: { data, signingAlgorithm, isDigest },
        permission
      } = req;

      const { projectId, ...result } = await server.services.cmek.cmekSign(
        { keyId: inputKeyId, data, signingAlgorithm, isDigest },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_SIGN,
          metadata: {
            keyId: inputKeyId,
            signingAlgorithm,
            signature: result.signature
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "verifyWithKmsKey",
      tags: [ApiDocsTags.KmsSigning],
      description: "Verify data signatures with a KMS key.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.VERIFY.keyId)
      }),
      body: z.object({
        isDigest: z.boolean().optional().default(false).describe(KMS.VERIFY.isDigest),
        data: base64Schema.describe(KMS.VERIFY.data),
        signature: signatureBase64Schema.describe(KMS.VERIFY.signature),
        signingAlgorithm: z.nativeEnum(SigningAlgorithm)
      }),
      response: {
        200: z.object({
          signatureValid: z.boolean(),
          keyId: z.string().uuid(),
          signingAlgorithm: z.nativeEnum(SigningAlgorithm)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { data, signature, signingAlgorithm, isDigest },
        permission
      } = req;

      const { projectId, ...result } = await server.services.cmek.cmekVerify(
        { keyId, data, signature, signingAlgorithm, isDigest },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_VERIFY,
          metadata: {
            keyId,
            signatureValid: result.signatureValid,
            signingAlgorithm,
            signature
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/generate-mac",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "generateMacWithKmsKey",
      tags: [ApiDocsTags.KmsSigning],
      description: "Generate an HMAC (MAC) for data with a KMS key.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.GENERATE_MAC.keyId)
      }),
      body: z.object({
        data: base64Schema.describe(KMS.GENERATE_MAC.data)
      }),
      response: {
        200: z.object({
          mac: z.string(),
          keyId: z.string().uuid(),
          macAlgorithm: z.nativeEnum(HmacAlgorithm)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { data },
        permission
      } = req;

      const { projectId, ...result } = await server.services.cmek.cmekGenerateMac({ keyId, data }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_GENERATE_MAC,
          metadata: {
            keyId,
            macAlgorithm: result.macAlgorithm,
            mac: result.mac
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/verify-mac",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "verifyMacWithKmsKey",
      tags: [ApiDocsTags.KmsSigning],
      description: "Verify an HMAC (MAC) for data with a KMS key.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.VERIFY_MAC.keyId)
      }),
      body: z.object({
        data: base64Schema.describe(KMS.VERIFY_MAC.data),
        mac: macBase64Schema.describe(KMS.VERIFY_MAC.mac)
      }),
      response: {
        200: z.object({
          macValid: z.boolean(),
          keyId: z.string().uuid(),
          macAlgorithm: z.nativeEnum(HmacAlgorithm)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { data, mac },
        permission
      } = req;

      const { projectId, ...result } = await server.services.cmek.cmekVerifyMac({ keyId, data, mac }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_VERIFY_MAC,
          metadata: {
            keyId,
            macAlgorithm: result.macAlgorithm,
            mac,
            macValid: result.macValid
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    bodyLimit: KMS_PAYLOAD_BODY_LIMIT_BYTES,
    url: "/keys/:keyId/decrypt",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "decryptWithKmsKey",
      tags: [ApiDocsTags.KmsEncryption],
      description: "Decrypt data with KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.DECRYPT.keyId)
      }),
      body: z.object({
        ciphertext: ciphertextBase64Schema.describe(KMS.DECRYPT.ciphertext)
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

      const { plaintext, projectId } = await server.services.cmek.cmekDecrypt({ keyId, ciphertext }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_DECRYPT,
          metadata: {
            keyId
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.CmekDecrypt,
          distinctId: getTelemetryDistinctId(req),
          organizationId: permission.orgId,
          properties: { keyId, projectId }
        })
        .catch(() => {});

      return { plaintext };
    }
  });
};
