import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { ApprovalPolicyBodySchema, SignerIdParamsSchema } from "./schemas";

export const registerSignerApprovalPolicyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:signerId/approval-policy",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerApprovalPolicy",
      tags: [ApiDocsTags.PkiSigners],
      description: "Read the signer's approval policy (steps, approvers, limits)",
      params: SignerIdParamsSchema,
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
    method: "PUT",
    url: "/:signerId/approval-policy",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updateSignerApprovalPolicy",
      tags: [ApiDocsTags.PkiSigners],
      description: "Replace the signer's approval policy (steps, approvers, limits)",
      params: SignerIdParamsSchema,
      body: ApprovalPolicyBodySchema
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
        projectId: await server.services.pkiSigner.getProjectIdForSigner(req.params.signerId),
        event: {
          type: EventType.UPDATE_PKI_SIGNER_APPROVAL_POLICY,
          metadata: { signerId: req.params.signerId, stepCount: req.body.steps.length }
        }
      });

      return policy;
    }
  });
};
