import { z } from "zod";

import { PkiSigningOperationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { AuthMode } from "@app/lib/auth/actor-types";
import { OrderByDirection } from "@app/lib/types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SigningOperationStatus } from "@app/services/signer/signer-enums";
import {
  MAX_SIGNING_ACTIVITY_SIGNERS,
  SigningActivityOrderBy,
  SigningActivityRange
} from "@app/services/signer/signer-types";

import { SignerIdParamsSchema } from "./schemas";

const SigningActivitySignerIdsSchema = z
  .string()
  .transform((val) => Array.from(new Set(val.split(",").map((id) => id.trim().toLowerCase()))))
  .pipe(z.array(z.string().uuid()).min(1).max(MAX_SIGNING_ACTIVITY_SIGNERS))
  .optional()
  .describe(`Comma-separated signer IDs to limit the activity to, up to ${MAX_SIGNING_ACTIVITY_SIGNERS}.`);

export const registerSignerOperationsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/activity-trend",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getSigningActivityTrend",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get signing operation counts per period across the signers the caller can read",
      querystring: z.object({
        range: z.nativeEnum(SigningActivityRange).default(SigningActivityRange.ThirtyDays),
        signerId: z.string().toLowerCase().uuid().optional(),
        signerIds: SigningActivitySignerIdsSchema
      }),
      response: {
        200: z.object({
          periods: z.array(
            z.object({
              period: z.string(),
              success: z.number(),
              failed: z.number()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.pkiSigner.getActivityTrend({
        ...req.query,
        projectId: req.internalCertManagerProjectId,
        actor: req.actor
      })
  });

  server.route({
    method: "GET",
    url: "/activity-by-signer",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "getSigningActivityBySigner",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Get signing operation totals and per-period counts by signer, across the signers the caller can read",
      querystring: z.object({
        range: z.nativeEnum(SigningActivityRange).default(SigningActivityRange.ThirtyDays).describe("Defaults to 30d."),
        signerIds: SigningActivitySignerIdsSchema,
        orderBy: z
          .nativeEnum(SigningActivityOrderBy)
          .default(SigningActivityOrderBy.Total)
          .describe("Orders signers by total operations or by failed operations. Defaults to total."),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.DESC)
          .describe("Defaults to desc. The first signers in this order are charted.")
      }),
      response: {
        200: z.object({
          signerTotals: z
            .array(
              z.object({
                signerId: z.string().uuid().describe("The signer ID."),
                signerName: z.string().describe("The signer name."),
                success: z.number().int().describe("Successful operations in the range."),
                failed: z.number().int().describe("Failed or denied operations in the range.")
              })
            )
            .describe(
              "Every readable signer, or every requested signer when signerIds is set, including signers with no operations, in orderBy and orderDirection order."
            ),
          periods: z
            .array(
              z.object({
                period: z.string().describe("YYYY-MM-DD for 7d and 30d, YYYY-MM for 6m."),
                signerCounts: z
                  .record(z.string().uuid(), z.number().int())
                  .describe(
                    `Operations per charted signer: every requested signer when signerIds is set, otherwise all when ${MAX_SIGNING_ACTIVITY_SIGNERS} or fewer, else the first ${MAX_SIGNING_ACTIVITY_SIGNERS - 1}.`
                  ),
                otherCount: z.number().int().describe("Operations for signers that are not charted.")
              })
            )
            .describe("Every period in the range, oldest first.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.pkiSigner.getActivityBySigner({
        ...req.query,
        projectId: req.internalCertManagerProjectId,
        actor: req.actor
      })
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
      params: SignerIdParamsSchema,
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pkiSigner.listOperations({
        signerId: req.params.signerId,
        ...req.query,
        actor: req.actor
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_PKI_SIGNING_OPERATIONS,
          metadata: {
            signerId: req.params.signerId,
            signerName: result.signerName,
            count: result.operations.length
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/operations/:operationId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSigningOperation",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get a signing operation with its full client context",
      params: z.object({ signerId: z.string().uuid(), operationId: z.string().uuid() }),
      response: {
        200: z.object({
          operation: PkiSigningOperationsSchema.extend({
            actorName: z.string().nullable(),
            actorMembershipId: z.string().uuid().nullable()
          }),
          signerName: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiSigner.getOperationById({
        signerId: req.params.signerId,
        operationId: req.params.operationId,
        actor: req.actor
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_PKI_SIGNING_OPERATION,
          metadata: {
            signerId: req.params.signerId,
            signerName: result.signerName,
            operationId: req.params.operationId
          }
        }
      });

      return result;
    }
  });
};
