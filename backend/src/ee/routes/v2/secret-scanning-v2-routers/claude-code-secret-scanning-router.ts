import { z } from "zod";

import { registerSecretScanningEndpoints } from "@app/ee/routes/v2/secret-scanning-v2-routers/secret-scanning-v2-endpoints";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  CheckClaudeCodeSecretsSchema,
  ClaudeCodeDataSourceSchema,
  ClaudeCodeSecretCheckResultSchema,
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

  const getFindingsUrl = (orgId: string, projectId: string) =>
    `${getConfig().SITE_URL}/organizations/${orgId}/projects/secret-scanning/${projectId}/findings`;

  // Called by the Claude Code plugin when its local scan finds secrets in a prompt. The secret values are hashed into
  // blind indexes to look up findings; neither the values nor the blind indexes are logged or returned.
  server.route({
    method: "POST",
    url: "/:dataSourceId/check-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "checkClaudeCodeDataSourceSecrets",
      tags: [ApiDocsTags.SecretScanning],
      description:
        "Check whether a prompt that holds these secrets can continue, based on the findings already recorded for them.",
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.CLAUDE_CODE.CHECK_SECRETS.dataSourceId)
      }),
      body: CheckClaudeCodeSecretsSchema,
      response: {
        200: z.object({
          allowed: z.boolean(),
          // whether the plugin must send the prompt, because a secret is new or came back after being resolved
          promptRequired: z.boolean(),
          // tells the plugin whether an allowed prompt still holds secrets it should warn about
          onSecretDetected: z.nativeEnum(ClaudeCodeSecretDetectedAction),
          // in the same order as the secrets in the request
          secrets: ClaudeCodeSecretCheckResultSchema.array(),
          findingsUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dataSourceId } = req.params;

      const { allowed, promptRequired, onSecretDetected, secrets, projectId } =
        await server.services.secretScanningV2.claudeCode.checkSecrets(
          { secrets: req.body.secrets, dataSourceId },
          req.permission
        );

      return {
        allowed,
        promptRequired,
        onSecretDetected,
        secrets,
        findingsUrl: getFindingsUrl(req.permission.orgId, projectId)
      };
    }
  });

  // Called by the Claude Code plugin when a check found a secret that has no finding yet.
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
        "Submit a prompt that holds new secrets. The prompt is scanned in the background, and its new secrets are recorded as findings.",
      params: z.object({
        dataSourceId: z.string().uuid().describe(SecretScanningDataSources.CLAUDE_CODE.SUBMIT_PROMPT.dataSourceId)
      }),
      body: SubmitClaudeCodePromptSchema,
      response: {
        200: z.object({
          isScanQueued: z.boolean(),
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

      const { projectId, dataSourceName, isScanQueued } =
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
              dataSourceId,
              dataSourceName
            }
          }
        });
      }

      return {
        isScanQueued,
        findingsUrl: getFindingsUrl(req.permission.orgId, projectId)
      };
    }
  });
};
