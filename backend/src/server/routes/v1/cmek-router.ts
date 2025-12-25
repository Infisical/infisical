import { z } from "zod";

import { InternalKmsSchema, KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, KMS } from "@app/lib/api-docs";
import { getBase64SizeInBytes, isBase64 } from "@app/lib/base64";
import { AllowedEncryptionKeyAlgorithms, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CmekOrderBy, TCmekKeyEncryptionAlgorithm } from "@app/services/cmek/cmek-types";
import { KmsKeyUsage, KMS_ROTATION_CONSTANTS } from "@app/services/kms/kms-types";

const keyNameSchema = slugSchema({ min: 1, max: 32, field: "Name" });
const keyDescriptionSchema = z.string().trim().max(500).optional();

const CmekSchema = KmsKeysSchema.merge(InternalKmsSchema.pick({ version: true, encryptionAlgorithm: true })).omit({
  isReserved: true
});

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
      hide: false,
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
          encryptionAlgorithm: z
            .enum(AllowedEncryptionKeyAlgorithms)
            .optional()
            .default(SymmetricKeyAlgorithm.AES_GCM_256)
            .describe(KMS.CREATE_KEY.encryptionAlgorithm)
        })
        .superRefine((data, ctx) => {
          if (
            data.keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT &&
            !Object.values(SymmetricKeyAlgorithm).includes(data.encryptionAlgorithm as SymmetricKeyAlgorithm)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `encryptionAlgorithm must be a valid symmetric encryption algorithm. Valid options are: ${Object.values(
                SymmetricKeyAlgorithm
              ).join(", ")}`
            });
          }
          if (
            data.keyUsage === KmsKeyUsage.SIGN_VERIFY &&
            !Object.values(AsymmetricKeyAlgorithm).includes(data.encryptionAlgorithm as AsymmetricKeyAlgorithm)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `encryptionAlgorithm must be a valid asymmetric sign-verify algorithm. Valid options are: ${Object.values(
                AsymmetricKeyAlgorithm
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
        body: { projectId, name, description, encryptionAlgorithm, keyUsage },
        permission
      } = req;

      const cmek = await server.services.cmek.createCmek(
        {
          orgId: permission.orgId,
          projectId,
          name,
          description,
          encryptionAlgorithm: encryptionAlgorithm as TCmekKeyEncryptionAlgorithm,
          keyUsage
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
            encryptionAlgorithm: encryptionAlgorithm as TCmekKeyEncryptionAlgorithm
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
      hide: false,
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
      hide: false,
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
      hide: false,
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

      return { keys: cmeks, totalCount };
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

      return { key };
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

      return { key };
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
      hide: false,
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

      const { publicKey, projectId } = await server.services.cmek.getPublicKey({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CMEK_GET_PUBLIC_KEY,
          metadata: {
            keyId
          }
        }
      });

      return { publicKey };
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
    url: "/keys/:keyId/sign",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
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
    url: "/keys/:keyId/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsSigning],
      description: "Verify data signatures with a KMS key.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.VERIFY.keyId)
      }),
      body: z.object({
        isDigest: z.boolean().optional().default(false).describe(KMS.VERIFY.isDigest),
        data: base64Schema.describe(KMS.VERIFY.data),
        signature: base64Schema.describe(KMS.VERIFY.signature),
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
    url: "/keys/:keyId/decrypt",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsEncryption],
      description: "Decrypt data with KMS key",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.DECRYPT.keyId)
      }),
      body: z.object({
        ciphertext: base64Schema.describe(KMS.DECRYPT.ciphertext)
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

      return { plaintext };
    }
  });

  // Rotate KMS key
  server.route({
    method: "POST",
    url: "/keys/:keyId/rotate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Rotate a KMS key. This generates new key material while preserving the old version for decrypting existing data. Only supported for symmetric encryption keys.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.ROTATE_KEY.keyId)
      }),
      response: {
        200: z.object({
          key: z.object({
            id: z.string().uuid(),
            version: z.number(),
            rotatedAt: z.string().nullable()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const result = await server.services.cmek.rotateCmek({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.ROTATE_CMEK,
          metadata: {
            keyId,
            newVersion: result.version,
            deletedVersions: result.deletedVersions,
            deletedVersionCount: result.deletedVersionCount
          }
        }
      });

      return {
        key: {
          id: result.kmsKeyId,
          version: result.version,
          rotatedAt: result.rotatedAt ?? null
        }
      };
    }
  });

  // List KMS key versions
  server.route({
    method: "GET",
    url: "/keys/:keyId/versions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsKeys],
      description: "List all versions of a KMS key. Returns the version history including creation timestamps.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.LIST_KEY_VERSIONS.keyId)
      }),
      response: {
        200: z.object({
          keyId: z.string().uuid(),
          currentVersion: z.number(),
          versions: z.array(
            z.object({
              id: z.string().uuid(),
              version: z.number(),
              createdAt: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const result = await server.services.cmek.listCmekVersions({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.LIST_CMEK_VERSIONS,
          metadata: {
            keyId,
            versionCount: result.versions.length
          }
        }
      });

      return {
        keyId: result.kmsKeyId,
        currentVersion: result.currentVersion,
        versions: result.versions
      };
    }
  });

  // Rollback KMS key to a previous version
  server.route({
    method: "POST",
    url: "/keys/:keyId/rollback",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Rollback a KMS key to a previous version. This sets the target version as the current key for encryption while preserving all version history.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.ROLLBACK_KEY.keyId)
      }),
      body: z.object({
        targetVersion: z.number().int().min(1).describe(KMS.ROLLBACK_KEY.targetVersion)
      }),
      response: {
        200: z.object({
          key: z.object({
            id: z.string().uuid(),
            version: z.number(),
            previousVersion: z.number()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { targetVersion },
        permission
      } = req;

      const result = await server.services.cmek.rollbackCmek({ keyId, targetVersion }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.ROLLBACK_CMEK,
          metadata: {
            keyId,
            targetVersion: result.version,
            previousVersion: result.previousVersion
          }
        }
      });

      return {
        key: {
          id: result.kmsKeyId,
          version: result.version,
          previousVersion: result.previousVersion
        }
      };
    }
  });

  // Get scheduled rotation settings
  server.route({
    method: "GET",
    url: "/keys/:keyId/scheduled-rotation",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Get scheduled rotation settings for a KMS key. Returns whether auto rotation is enabled, the rotation interval, and when the next rotation is scheduled.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.GET_SCHEDULED_ROTATION.keyId)
      }),
      response: {
        200: z.object({
          keyId: z.string().uuid(),
          isAutoRotationEnabled: z.boolean(),
          rotationIntervalDays: z.number().nullable(),
          nextRotationAt: z.string().nullable(),
          lastRotatedAt: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        permission
      } = req;

      const result = await server.services.cmek.getCmekScheduledRotation({ keyId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_CMEK_SCHEDULED_ROTATION,
          metadata: {
            keyId
          }
        }
      });

      return {
        keyId: result.kmsKeyId,
        isAutoRotationEnabled: result.isAutoRotationEnabled,
        rotationIntervalDays: result.rotationIntervalDays ?? null,
        nextRotationAt: result.nextRotationAt ?? null,
        lastRotatedAt: result.lastRotatedAt ?? null
      };
    }
  });

  // Update scheduled rotation settings
  server.route({
    method: "PUT",
    url: "/keys/:keyId/scheduled-rotation",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.KmsKeys],
      description:
        "Configure scheduled automatic rotation for a KMS key. When enabled, the key will automatically rotate at the specified interval.",
      params: z.object({
        keyId: z.string().uuid().describe(KMS.UPDATE_SCHEDULED_ROTATION.keyId)
      }),
      body: z.object({
        enableAutoRotation: z.boolean().describe(KMS.UPDATE_SCHEDULED_ROTATION.enableAutoRotation),
        rotationIntervalDays: z
          .number()
          .int()
          .min(KMS_ROTATION_CONSTANTS.MIN_INTERVAL_DAYS)
          .max(KMS_ROTATION_CONSTANTS.MAX_INTERVAL_DAYS)
          .optional()
          .describe(KMS.UPDATE_SCHEDULED_ROTATION.rotationIntervalDays)
      }),
      response: {
        200: z.object({
          keyId: z.string().uuid(),
          isAutoRotationEnabled: z.boolean(),
          rotationIntervalDays: z.number().nullable(),
          nextRotationAt: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        params: { keyId },
        body: { enableAutoRotation, rotationIntervalDays },
        permission
      } = req;

      const result = await server.services.cmek.updateCmekScheduledRotation(
        { keyId, enableAutoRotation, rotationIntervalDays },
        permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.UPDATE_CMEK_SCHEDULED_ROTATION,
          metadata: {
            keyId,
            enableAutoRotation,
            rotationIntervalDays: rotationIntervalDays ?? null
          }
        }
      });

      return {
        keyId: result.kmsKeyId,
        isAutoRotationEnabled: result.isAutoRotationEnabled,
        rotationIntervalDays: result.rotationIntervalDays ?? null,
        nextRotationAt: result.nextRotationAt ?? null
      };
    }
  });
};
