import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SignerIdParamsSchema } from "./schemas";

export const registerSignerRequestsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:signerId/requests",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSignerRequests",
      tags: [ApiDocsTags.PkiSigners],
      description: "List signing approval requests for a signer",
      params: SignerIdParamsSchema,
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
      params: SignerIdParamsSchema,
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
        projectId: await server.services.pkiSigner.getProjectIdForSigner(req.params.signerId),
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
      params: SignerIdParamsSchema,
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
        projectId: await server.services.pkiSigner.getProjectIdForSigner(req.params.signerId),
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
        projectId: await server.services.pkiSigner.getProjectIdForSigner(req.params.signerId),
        event: {
          type: EventType.PKI_SIGNER_REVOKE_REQUEST,
          metadata: { signerId: req.params.signerId, requestId: req.params.requestId }
        }
      });

      return result;
    }
  });
};
