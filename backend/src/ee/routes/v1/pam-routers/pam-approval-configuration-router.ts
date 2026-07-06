import z from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { AuthMode } from "@app/services/auth/auth-type";

const ApproverSchema = z.object({
  type: z.nativeEnum(ApproverType),
  id: z.string().uuid()
});

const StepSchema = z.object({
  approvers: z.array(ApproverSchema)
});

export const registerPamApprovalConfigurationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:folderId/approval-configuration",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        folderId: z.string().uuid()
      }),
      response: {
        200: z.object({
          policy: z
            .object({
              id: z.string().uuid(),
              name: z.string()
            })
            .nullable(),
          steps: z.array(
            z.object({
              requiredApprovals: z.number(),
              approvers: z.array(ApproverSchema),
              name: z.string().nullish(),
              notifyApprovers: z.boolean().nullish()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.getApprovalConfiguration({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return result;
    }
  });

  server.route({
    method: "PUT",
    url: "/:folderId/approval-configuration",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({
        folderId: z.string().uuid()
      }),
      body: z.object({
        steps: z.array(StepSchema).max(1)
      }),
      response: {
        200: z.object({
          policyId: z.string().uuid().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.setApprovalConfiguration({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        steps: req.body.steps,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_APPROVAL_CONFIG_UPDATE,
          metadata: {
            folderId: req.params.folderId,
            policyId: result.policyId,
            stepCount: result.stepCount
          }
        }
      });

      return { policyId: result.policyId };
    }
  });
};
