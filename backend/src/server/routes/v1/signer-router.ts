import { z } from "zod";

import { PkiSignersSchema, PkiSigningOperationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { SigningOperationStatus } from "@app/services/signer/signer-enums";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SIGNER_KEY_ALGORITHM_VALUES = [
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.RSA_3072,
  CertKeyAlgorithm.RSA_4096,
  CertKeyAlgorithm.ECDSA_P256,
  CertKeyAlgorithm.ECDSA_P384,
  CertKeyAlgorithm.ECDSA_P521
] as const;
const SignerKeyAlgorithmEnum = z.enum(SIGNER_KEY_ALGORITHM_VALUES);

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
        projectId: z.string().trim().optional().describe(openApiHidden()),
        name: slugSchema({ min: 1, max: 64, field: "name" }),
        description: z.string().trim().max(256).optional(),
        caId: z.string().uuid().optional(),
        commonName: z.string().trim().min(1).max(256).optional(),
        certificateTtlDays: z.number().int().min(1).max(3650).optional(),
        renewBeforeDays: z.number().int().min(1).max(30).nullable().optional(),
        keyAlgorithm: SignerKeyAlgorithmEnum.optional(),
        certificateId: z.string().uuid().optional(),
        approvalPolicyId: z.string().uuid().optional(),
        members: z
          .array(
            z.object({
              kind: z.enum(["user", "identity", "group"]),
              id: z.string().uuid(),
              role: z.string().min(1)
            })
          )
          .optional(),
        approvalPolicy: z
          .object({
            steps: z.array(
              z.object({
                stepNumber: z.number().int().min(1),
                name: z.string().trim().max(64).nullable().optional(),
                requiredApprovals: z.number().int().min(1),
                approverUserIds: z.array(z.string().uuid()).default([]),
                approverGroupIds: z.array(z.string().uuid()).default([])
              })
            ),
            constraints: z
              .object({
                maxSignings: z.number().int().min(1).nullable().optional(),
                maxWindowDuration: z.string().nullable().optional()
              })
              .optional()
          })
          .optional()
      }),
      response: {
        200: PkiSignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.create({
        ...req.body,
        projectId: req.body.projectId ?? req.internalCertManagerProjectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.CREATE_PKI_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            certificateId: signer.certificateId,
            approvalPolicyId: signer.approvalPolicyId
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SignerCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId
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
        projectId: z.string().trim().optional().describe(openApiHidden()),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          signers: z.array(
            PkiSignersSchema.extend({
              certificateCommonName: z.string().nullable().optional(),
              certificateSerialNumber: z.string().nullable().optional(),
              certificateNotAfter: z.date().nullable().optional(),
              approvalPolicyName: z.string().nullable().optional()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.query.projectId ?? req.internalCertManagerProjectId;
      const { signers, totalCount } = await server.services.pkiSigner.list({
        ...req.query,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_PKI_SIGNERS,
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
        200: PkiSignersSchema.extend({
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
      const signer = await server.services.pkiSigner.getById({
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
          type: EventType.GET_PKI_SIGNER,
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
    method: "GET",
    url: "/:signerId/my-permissions",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerMyPermissions",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get the caller's effective per-signer capabilities",
      params: z.object({ signerId: z.string().uuid() }),
      response: {
        200: z.object({
          canRead: z.boolean(),
          canEdit: z.boolean(),
          canDelete: z.boolean(),
          canEnableDisable: z.boolean(),
          canManageMembers: z.boolean(),
          canManagePolicy: z.boolean(),
          canSign: z.boolean(),
          canRequestSign: z.boolean(),
          canPreApprove: z.boolean(),
          canReissueCertificate: z.boolean(),
          canExportCertificate: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pkiSigner.getMyPermissions({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
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
        renewBeforeDays: z.number().int().min(1).max(30).nullable().optional()
      }),
      response: {
        200: PkiSignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.update({
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
          type: EventType.UPDATE_PKI_SIGNER,
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
        200: PkiSignersSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.delete({
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
          type: EventType.DELETE_PKI_SIGNER,
          metadata: {
            signerId: signer.id,
            name: signer.name
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SignerDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId
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
            reportedIp: z.string().max(64).optional()
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
      let actorName: string | undefined;
      if (req.auth.authMode === AuthMode.JWT) {
        actorName = `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim() || undefined;
      } else if (req.auth.authMode === AuthMode.IDENTITY_ACCESS_TOKEN) {
        actorName = req.auth.identityName ?? undefined;
      }

      const result = await server.services.pkiSigner.sign({
        signerId: req.params.signerId,
        ...req.body,
        actorName,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.PKI_SIGNER_SIGN,
          metadata: {
            signerId: req.params.signerId,
            name: result.signerName,
            signingAlgorithm: req.body.signingAlgorithm
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CodeSigningOperation,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          signerId: req.params.signerId
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
      const result = await server.services.pkiSigner.getPublicKey({
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
          type: EventType.GET_PKI_SIGNER_PUBLIC_KEY,
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
    method: "POST",
    url: "/:signerId/enable",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "enableSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Enable a disabled signer",
      params: z.object({ signerId: z.string().uuid() }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.enable({
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
          type: EventType.ENABLE_PKI_SIGNER,
          metadata: { signerId: signer.id, name: signer.name }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/disable",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "disableSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Disable an active signer",
      params: z.object({ signerId: z.string().uuid() }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.disable({
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
          type: EventType.DISABLE_PKI_SIGNER,
          metadata: { signerId: signer.id, name: signer.name }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/certificate/reissue",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "reissueSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description: "Re-issue the signer's certificate (optionally from a different CA)",
      params: z.object({ signerId: z.string().uuid() }),
      body: z.object({
        caId: z.string().uuid(),
        commonName: z.string().trim().min(1).max(256).optional(),
        certificateTtlDays: z.number().int().min(1).max(3650).optional()
      }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.reissueCertificate({
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
          type: EventType.REISSUE_PKI_SIGNER_CERTIFICATE,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            caId: req.body.caId,
            commonName: req.body.commonName
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/certificate",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "exportSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description: "Export the signer's leaf certificate as PEM",
      params: z.object({ signerId: z.string().uuid() }),
      response: {
        200: z.object({
          certificatePem: z.string(),
          serialNumber: z.string(),
          signerName: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { certificatePem, serialNumber, signerName, projectId } = await server.services.pkiSigner.exportCertificate(
        {
          signerId: req.params.signerId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        }
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.EXPORT_PKI_SIGNER_CERTIFICATE,
          metadata: { signerId: req.params.signerId, name: signerName, serialNumber }
        }
      });

      return { certificatePem, serialNumber, signerName };
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/approval-policy",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerApprovalPolicy",
      tags: [ApiDocsTags.PkiSigners],
      description: "Read the signer's approval policy (steps, approvers, limits)",
      params: z.object({ signerId: z.string().uuid() }),
      response: {
        200: z.object({
          id: z.string().uuid(),
          signerId: z.string().uuid(),
          hasSteps: z.boolean(),
          steps: z.array(z.any()),
          constraints: z.object({
            maxSignings: z.number().nullable(),
            maxWindowDuration: z.string().nullable()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.signerPolicy.getPolicy({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
    }
  });

  server.route({
    method: "PATCH",
    url: "/:signerId/approval-policy",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerApprovalPolicy",
      tags: [ApiDocsTags.PkiSigners],
      description: "Edit the signer's approval policy (steps, approvers, limits)",
      params: z.object({ signerId: z.string().uuid() }),
      body: z.object({
        steps: z.array(
          z.object({
            stepNumber: z.number().int().min(1),
            name: z.string().trim().max(64).nullable().optional(),
            requiredApprovals: z.number().int().min(1),
            approverUserIds: z.array(z.string().uuid()).default([]),
            approverGroupIds: z.array(z.string().uuid()).default([])
          })
        ),
        constraints: z
          .object({
            maxSignings: z.number().int().min(1).nullable().optional(),
            maxWindowDuration: z.string().nullable().optional()
          })
          .optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const policy = await server.services.signerPolicy.updatePolicy({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_SIGNER_APPROVAL_POLICY,
          metadata: { signerId: req.params.signerId, stepCount: req.body.steps.length }
        }
      });

      return policy;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/requests",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerRequests",
      tags: [ApiDocsTags.PkiSigners],
      description: "List signing approval requests for a signer",
      params: z.object({ signerId: z.string().uuid() }),
      querystring: z.object({
        statuses: z
          .string()
          .optional()
          .transform((v) =>
            v
              ? v
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s): s is "pending" | "approved" | "expired" | "revoked" =>
                    ["pending", "approved", "expired", "revoked"].includes(s)
                  )
              : undefined
          ),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(25)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.signerPolicy.listRequests({
        signerId: req.params.signerId,
        statuses: req.query.statuses,
        offset: req.query.offset,
        limit: req.query.limit,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/requests",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "requestToSign",
      tags: [ApiDocsTags.PkiSigners],
      description: "Open a request to sign with this signer (operator self-serve)",
      params: z.object({ signerId: z.string().uuid() }),
      body: z.object({
        justification: z.string().trim().min(1).max(2048),
        requestedSignings: z.number().int().min(1).optional(),
        requestedWindowStart: z.string().datetime().optional(),
        requestedWindowEnd: z.string().datetime().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const request = await server.services.signerPolicy.requestToSign({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.PKI_SIGNER_REQUEST_TO_SIGN,
          metadata: { signerId: req.params.signerId, requestId: request?.id }
        }
      });

      return request;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/requests/pre-approve",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "preApproveSigning",
      tags: [ApiDocsTags.PkiSigners],
      description: "Pre-approve signing for a member (admin only)",
      params: z.object({ signerId: z.string().uuid() }),
      body: z.object({
        granteeUserId: z.string().uuid().optional(),
        granteeIdentityId: z.string().uuid().optional(),
        justification: z.string().trim().min(1).max(2048),
        requestedSignings: z.number().int().min(1).optional(),
        requestedWindowStart: z.string().datetime().optional(),
        requestedWindowEnd: z.string().datetime().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signerPolicy.preApproveSigning({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.PKI_SIGNER_PRE_APPROVE_SIGNING,
          metadata: {
            signerId: req.params.signerId,
            requestId: result?.request?.id,
            granteeUserId: req.body.granteeUserId,
            granteeIdentityId: req.body.granteeIdentityId
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/requests/:requestId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revokeSignerRequest",
      tags: [ApiDocsTags.PkiSigners],
      description: "Revoke a pending or active signing request",
      params: z.object({ signerId: z.string().uuid(), requestId: z.string().uuid() })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.signerPolicy.revokeRequest({
        signerId: req.params.signerId,
        requestId: req.params.requestId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.PKI_SIGNER_REVOKE_REQUEST,
          metadata: { signerId: req.params.signerId, requestId: req.params.requestId }
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
            PkiSigningOperationsSchema.extend({
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
      const result = await server.services.pkiSigner.listOperations({
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
          type: EventType.GET_PKI_SIGNING_OPERATIONS,
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
