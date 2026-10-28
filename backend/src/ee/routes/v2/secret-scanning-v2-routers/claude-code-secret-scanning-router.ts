import { z } from "zod";

import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  ClaudeCodeDataSourceSchema,
  CreateClaudeCodeDataSourceSchema,
  SubmitClaudeCodePromptSchema,
  UpdateClaudeCodeDataSourceSchema
} from "@app/ee/services/secret-scanning-v2/claude-code";
import { ClaudeCodeSecretDetectedAction } from "@app/ee/services/secret-scanning-v2/claude-code/claude-code-secret-scanning-enums";
import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { ApiDocsTags, SecretScanningDataSources } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerClaudeCodeSecretScanningRouter = async (server: FastifyZodProvider) => {
  await registerSecretScanningEndpoints({
    type: SecretScanningDataSource.ClaudeCode,
    server,
    responseSchema: ClaudeCodeDataSourceSchema,
    createSchema: CreateClaudeCodeDataSourceSchema,
    updateSchema: UpdateClaudeCodeDataSourceSchema
  });

  // Called by the Claude Code plugin when its local scan finds a secret in a prompt.
  server.route({
    method: "POST",
    url: "/:dataSourceId/prompts",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "submitClaudeCodeDataSourcePrompt",
      tags: [ApiDocsTags.SecretScanning],
      description:
        "Submit a prompt that holds secrets. The prompt is allowed once every secret in it has been reviewed, or right away if the data source only reports; new secrets are scanned and recorded as findings.",
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.CLAUDE_CODE.SUBMIT_PROMPT.dataSourceId)
      }),
      body: SubmitClaudeCodePromptSchema,
      response: {
        200: z.object({
          allowed: z.boolean(),
          // tells the plugin whether an allowed prompt still holds unreviewed secrets it should warn about
          onSecretDetected: z.nativeEnum(ClaudeCodeSecretDetectedAction),
          pendingFingerprints: z.string().array(),
          findingsUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;
      const { actor } = req.auditLogInfo;

      const submitter =
        actor.type === ActorType.USER
          ? {
              id: actor.metadata.userId,
              name: actor.metadata.username,
              email: actor.metadata.email ?? undefined
            }
          : {
              id: req.permission.id,
              name: actor.type === ActorType.IDENTITY ? actor.metadata.name : req.permission.id
            };

      const { allowed, onSecretDetected, pendingFingerprints, projectId, isScanQueued } =
        await server.services.secretScanningV2.claudeCode.submitPrompt(
          { ...req.body, dataSourceId, submitter },
          req.permission
        );

      if (isScanQueued) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId,
          event: {
            type: EventType.SECRET_SCANNING_DATA_SOURCE_TRIGGER_SCAN,
            metadata: {
              type: SecretScanningDataSource.ClaudeCode,
              dataSourceId
            }
          }
        });
      }

      return {
        allowed,
        onSecretDetected,
        pendingFingerprints,
        findingsUrl: `${getConfig().SITE_URL}/organizations/${req.permission.orgId}/projects/secret-scanning/${projectId}/findings`
      };
    }
  });
};
