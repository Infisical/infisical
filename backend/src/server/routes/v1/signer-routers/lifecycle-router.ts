import { z } from "zod";

import { PkiSignersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden, slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeySource } from "@app/services/signer/signer-enums";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import {
  ApprovalPolicyBodySchema,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerExternalConfigurationSchema,
  SignerIdParamsSchema,
  SignerKeyAlgorithm
} from "./schemas";

const SignerWithCertificateResponseSchema = PkiSignersSchema.extend({
  certificateCommonName: z.string().nullable().optional(),
  certificateSerialNumber: z.string().nullable().optional(),
  certificateNotAfter: z.date().nullable().optional(),
  certificateNotBefore: z.date().nullable().optional(),
  certificateKeyAlgorithm: z.string().nullable().optional(),
  certificateKeySource: z.string().nullable().optional(),
  certificateHsmConnectorId: z.string().nullable().optional(),
  certificateStatus: z.string().nullable().optional(),
  certificateCaId: z.string().nullable().optional(),
  approvalPolicyName: z.string().nullable().optional()
});

export const registerSignerLifecycleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createSigner",
      tags: [ApiDocsTags.PkiSigners],
      description: "Create a code signing signer",
      body: z
        .object({
          projectId: z.string().trim().optional().describe(openApiHidden()),
          name: slugSchema({ min: 1, max: 64, field: "name" }),
          description: z.string().trim().max(256).optional(),
          caId: z.string().uuid().optional(),
          commonName: z.string().trim().min(1).max(256).optional(),
          certificateTtlDays: z.number().int().min(1).max(3650).optional(),
          certificateRenewBeforeDays: z.number().int().min(1).max(30).nullable().optional(),
          keyAlgorithm: SignerKeyAlgorithm.schema.optional(),
          certificateId: z.string().uuid().optional(),
          certificate: z
            .object({
              keySource: z.nativeEnum(CertKeySource).optional().default(CertKeySource.Infisical),
              hsmConnectorId: z.string().uuid().optional()
            })
            .optional(),
          externalConfiguration: SignerExternalConfigurationSchema.optional(),
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
          approvalPolicy: ApprovalPolicyBodySchema.optional()
        })
        .superRefine((data, ctx) => {
          if (data.certificate?.keySource !== CertKeySource.Hsm) return;
          if (!data.certificate.hsmConnectorId) {
            ctx.addIssue({
              code: "custom",
              message: `hsmConnectorId is required when keySource = '${CertKeySource.Hsm}'`,
              path: ["certificate", "hsmConnectorId"]
            });
          }
          if (!data.keyAlgorithm || !HSM_SUPPORTED_KEY_ALGORITHMS.includes(data.keyAlgorithm)) {
            ctx.addIssue({
              code: "custom",
              message: `keyAlgorithm must be one of ${HSM_SUPPORTED_KEY_ALGORITHMS.join(", ")} when keySource = '${CertKeySource.Hsm}'`,
              path: ["keyAlgorithm"]
            });
          }
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
            approvalPolicyId: signer.approvalPolicyId,
            keySource: req.body.certificate?.keySource,
            hsmConnectorId: req.body.certificate?.hsmConnectorId,
            externalConfiguration: req.body.externalConfiguration
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
      params: SignerIdParamsSchema,
      response: {
        200: SignerWithCertificateResponseSchema
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
    url: "/:signerId/permissions",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerPermissions",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get the actor's effective resource permissions on this signer.",
      params: SignerIdParamsSchema,
      response: {
        200: z.object({
          data: z.object({
            permissions: z.any().array(),
            memberships: z
              .object({
                id: z.string(),
                actorUserId: z.string().nullish(),
                actorIdentityId: z.string().nullish(),
                actorGroupId: z.string().nullish(),
                roles: z.object({ role: z.string(), customRoleSlug: z.string().nullish() }).array()
              })
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.pkiSigner.getMyPermissions({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { data };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/issuance/check",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "checkSignerIssuance",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Poll the upstream CA for a pending signer's certificate immediately instead of waiting for the next scheduled check.",
      params: SignerIdParamsSchema,
      response: {
        200: SignerWithCertificateResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.checkIssuanceNow({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
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
      params: SignerIdParamsSchema,
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }).optional(),
        description: z.string().trim().max(256).nullable().optional(),
        certificateRenewBeforeDays: z.number().int().min(1).max(30).nullable().optional()
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
      params: SignerIdParamsSchema,
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
    method: "PATCH",
    url: "/:signerId/status",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerStatus",
      tags: [ApiDocsTags.PkiSigners],
      description: "Enable or disable a signer in a single endpoint",
      params: SignerIdParamsSchema,
      body: z.object({ status: z.enum(["active", "disabled"]) }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const wantDisabled = req.body.status === "disabled";
      const signer = wantDisabled
        ? await server.services.pkiSigner.disable({
            signerId: req.params.signerId,
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId
          })
        : await server.services.pkiSigner.enable({
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
          type: wantDisabled ? EventType.DISABLE_PKI_SIGNER : EventType.ENABLE_PKI_SIGNER,
          metadata: { signerId: signer.id, name: signer.name }
        }
      });

      return signer;
    }
  });
};
