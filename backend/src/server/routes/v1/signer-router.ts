import { z } from "zod";

import { SignersSchema, SigningOperationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SignerStatus, SigningOperationStatus } from "@app/services/signer/signer-enums";

export const registerSignerRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Create a code signing signer",
      body: z.object({
        projectId: z.string().trim(),
        name: slugSchema({ min: 1, max: 64, field: "name" }),
        description: z.string().trim().max(256).optional(),
        certificateId: z.string().uuid(),
        approvalPolicyId: z.string().uuid()
      }),
      response: {
        200: SignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.signer.create({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.CREATE_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            certificateId: signer.certificateId,
            approvalPolicyId: signer.approvalPolicyId
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSigners",
      tags: [ApiDocsTags.PkiSigners],
      description: "List code signing signers for a project",
      querystring: z.object({
        projectId: z.string().trim(),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          signers: z.array(SignersSchema.extend({
            certificateCommonName: z.string().nullable().optional(),
            certificateSerialNumber: z.string().nullable().optional(),
            certificateNotAfter: z.date().nullable().optional(),
            approvalPolicyName: z.string().nullable().optional()
          })),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { signers, totalCount } = await server.services.signer.list({
        ...req.query,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_SIGNERS,
          metadata: {
            count: signers.length,
            offset: req.query.offset,
            limit: req.query.limit
          }
        }
      });

      return { signers, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerById",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get a code signing signer by ID",
      params: z.object({
        signerId: z.string().uuid()
      }),
      response: {
        200: SignersSchema.extend({
          certificateCommonName: z.string().nullable().optional(),
          certificateSerialNumber: z.string().nullable().optional(),
          certificateNotAfter: z.date().nullable().optional(),
          certificateNotBefore: z.date().nullable().optional(),
          certificateKeyAlgorithm: z.string().nullable().optional(),
          certificateStatus: z.string().nullable().optional(),
          certificateCaId: z.string().nullable().optional(),
          approvalPolicyName: z.string().nullable().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.signer.getById({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.GET_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:signerId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Update a code signing signer",
      params: z.object({
        signerId: z.string().uuid()
      }),
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }).optional(),
        description: z.string().trim().max(256).nullable().optional(),
        status: z.nativeEnum(SignerStatus).optional(),
        certificateId: z.string().uuid().optional(),
        approvalPolicyId: z.string().uuid().optional()
      }),
      response: {
        200: SignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.signer.update({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.UPDATE_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:signerId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deleteSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Delete a code signing signer",
      params: z.object({
        signerId: z.string().uuid()
      }),
      response: {
        200: SignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.signer.delete({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.DELETE_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/sign",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "signData",
      tags: [ApiDocsTags.PkiSigners],
      description: "Sign a pre-hashed digest with a code signing signer",
      params: z.object({
        signerId: z.string().uuid()
      }),
      body: z.object({
        data: z.string().min(1).max(172), // 128 bytes max in base64 = ceil(128/3)*4 = 172 chars
        signingAlgorithm: z.nativeEnum(SigningAlgorithm),
        isDigest: z.boolean().default(false),
        clientMetadata: z
          .object({
            tool: z.string().max(128).optional(),
            hostname: z.string().max(256).optional(),
            ip: z.string().max(64).optional()
          })
          .optional()
      }),
      response: {
        200: z.object({
          signature: z.string(),
          signingAlgorithm: z.string(),
          signerId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signer.sign({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.SIGNER_SIGN,
          metadata: {
            signerId: req.params.signerId,
            name: result.signerName,
            signingAlgorithm: req.body.signingAlgorithm
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/public-key",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerPublicKey",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get the public key for a code signing signer",
      params: z.object({
        signerId: z.string().uuid()
      }),
      response: {
        200: z.object({
          publicKey: z.string(),
          algorithm: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signer.getPublicKey({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_SIGNER_PUBLIC_KEY,
          metadata: {
            signerId: req.params.signerId,
            name: result.signerName
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/operations",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSigningOperations",
      tags: [ApiDocsTags.PkiSigners],
      description: "List signing operations for a signer",
      params: z.object({
        signerId: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.nativeEnum(SigningOperationStatus).optional()
      }),
      response: {
        200: z.object({
          operations: z.array(
            SigningOperationsSchema.extend({
              actorName: z.string().nullable(),
              actorMembershipId: z.string().uuid().nullable()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signer.listOperations({
        signerId: req.params.signerId,
        ...req.query,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_SIGNING_OPERATIONS,
          metadata: {
            signerId: req.params.signerId,
            count: result.operations.length
          }
        }
      });

      return result;
    }
  });
};
