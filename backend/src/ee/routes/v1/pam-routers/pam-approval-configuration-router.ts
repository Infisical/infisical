import z from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ApproverSchema = z.object({
  type: z.enum(["user", "group"]),
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
      return result;
    }
  });
};
