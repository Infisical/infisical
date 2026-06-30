import { z } from "zod";

import { PkiSigningOperationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SigningOperationStatus } from "@app/services/signer/signer-enums";

import { SignerIdParamsSchema } from "./schemas";

export const registerSignerOperationsRouter = async (server: FastifyZodProvider) => {
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
