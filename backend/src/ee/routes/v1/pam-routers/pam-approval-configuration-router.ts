import z from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamNotificationEvent } from "@app/ee/services/pam/pam-enums";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
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

const NotificationChannelSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(256)
});

const NotificationConfigSchema = z.object({
  workflowIntegrationId: z.string().uuid(),
  channels: z.array(NotificationChannelSchema).min(1).max(20),
  events: z.array(z.nativeEnum(PamNotificationEvent)).min(1)
});

// Responses describe stored data rather than constrain it, so a row whose jsonb fails parsing
// (returned as an empty array) can't fail serialization and break the whole GET
const NotificationConfigResponseSchema = z.object({
  id: z.string().uuid(),
  workflowIntegrationId: z.string().uuid(),
  integration: z.string(),
  integrationSlug: z.string(),
  channels: z.object({ id: z.string(), name: z.string() }).array(),
  events: z.nativeEnum(PamNotificationEvent).array()
});

export const registerPamApprovalConfigurationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:folderId/approval-configuration",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPamFolderApprovalConfiguration",
      description: "Get the access request approval configuration for a PAM folder",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      response: {
        200: z.object({
          steps: z.array(
            z.object({
              approvers: z.array(ApproverSchema)
            })
          ),
          notificationConfigs: z.array(NotificationConfigResponseSchema),
          breakGlassUsers: z.array(ApproverSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
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
      hide: false,
      operationId: "setPamFolderApprovalConfiguration",
      description: "Replace the access request approval configuration for a PAM folder",
      tags: [ApiDocsTags.PamAccessRequests],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      body: z.object({
        steps: z.array(StepSchema).max(1).describe("Approval steps; an empty array removes the approval requirement"),
        notificationConfigs: z
          .array(NotificationConfigSchema)
          .max(10)
          .optional()
          .describe("Workflow integration channels to notify about access request events"),
        breakGlassUsers: z
          .array(ApproverSchema)
          .max(20)
          .optional()
          .describe(
            "Users and groups allowed to grant themselves access without an approver. Omitted leaves the stored list unchanged; an empty array clears it."
          )
      }),
      response: {
        200: z.object({
          policyId: z.string().uuid().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pamAccessRequest.setApprovalConfiguration({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        steps: req.body.steps,
        notificationConfigs: req.body.notificationConfigs,
        breakGlassUsers: req.body.breakGlassUsers,
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
            stepCount: result.stepCount,
            notificationConfigCount: result.notificationConfigCount,
            breakGlassUserCount: result.breakGlassUserCount
          }
        }
      });

      return { policyId: result.policyId };
    }
  });
};
