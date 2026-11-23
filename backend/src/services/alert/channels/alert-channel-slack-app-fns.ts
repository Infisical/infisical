import { ErrorCode, WebClient } from "@slack/web-api";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  SlackAppChannelConfigSchema,
  TAlertChannelDeps,
  TAlertChannelScopeDeps,
  TAlertChannelSendContext,
  TChannelResult
} from "../alert-channel-types";
import { buildSlackPayload } from "./alert-channel-slack-fns";

const SLACK_INTEGRATION_MISSING_MESSAGE =
  "The Slack integration this channel posts through no longer exists. Edit the alert and select another Slack integration.";

export const SLACK_APP_REQUIRED_ORG_PERMISSION = {
  permission: [OrgPermissionActions.Read, OrgPermissionSubjects.Settings] as OrgPermissionSet,
  message:
    "Posting through a Slack integration needs permission to read organization settings. Ask an organization admin, or use a Slack webhook URL instead."
};

const SLACK_AUTH_ERRORS = ["invalid_auth", "not_authed", "token_revoked", "account_inactive", "token_expired"];

const findSlackIntegrationInOrg = async (
  slackIntegrationDAL: TAlertChannelScopeDeps["slackIntegrationDAL"],
  orgId: string,
  workflowIntegrationId: string,
  options?: { readFromPrimary?: boolean }
) => {
  const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
    workflowIntegrationId,
    undefined,
    options
  );
  if (
    !slackIntegration ||
    slackIntegration.orgId !== orgId ||
    slackIntegration.integration !== WorkflowIntegration.SLACK
  ) {
    return null;
  }
  return slackIntegration;
};

export const assertSlackAppConfigInScope = async (
  { orgId, config }: { orgId: string; config: Record<string, unknown> },
  { slackIntegrationDAL }: TAlertChannelScopeDeps
) => {
  const { workflowIntegrationId } = SlackAppChannelConfigSchema.parse(config);
  // A replica can lag behind an integration that was connected moments ago.
  const slackIntegration = await findSlackIntegrationInOrg(slackIntegrationDAL, orgId, workflowIntegrationId, {
    readFromPrimary: true
  });
  if (!slackIntegration) {
    throw new BadRequestError({
      message: `Slack integration with ID '${workflowIntegrationId}' was not found in this organization`
    });
  }
};

export const getSlackAppWorkflowIntegrationId = (config: Record<string, unknown>) =>
  SlackAppChannelConfigSchema.parse(config).workflowIntegrationId;

export const createSlackAppClient = async (
  { slackIntegrationDAL, kmsDataKeyService }: Pick<TAlertChannelDeps, "slackIntegrationDAL" | "kmsDataKeyService">,
  orgId: string,
  workflowIntegrationId: string
) => {
  const slackIntegration = await findSlackIntegrationInOrg(slackIntegrationDAL, orgId, workflowIntegrationId);
  if (!slackIntegration) return null;

  const { decryptor } = await kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });
  const botToken = decryptor({ cipherTextBlob: slackIntegration.encryptedBotAccessToken }).toString("utf8");

  // The SDK's default retry policy waits up to half an hour, which would stall the whole dispatch run.
  return new WebClient(botToken, {
    timeout: ALERT_CHANNEL_HTTP_TIMEOUT,
    retryConfig: { retries: 2, maxRetryTime: ALERT_CHANNEL_HTTP_TIMEOUT },
    rejectRateLimitedCalls: true
  });
};

export const describeSlackPostError = (err: unknown, channelName: string): string => {
  const { code, data } = (err ?? {}) as { code?: string; data?: { error?: string } };
  if (code === ErrorCode.PlatformError && data?.error) {
    const slackError = data.error;
    if (slackError === "not_in_channel") {
      return `The Infisical app isn't in #${channelName}. Add it to the channel in Slack, then try again.`;
    }
    if (slackError === "channel_not_found") {
      return `#${channelName} was not found. It may have been deleted, or it's a private channel the Infisical app isn't in.`;
    }
    if (slackError === "is_archived") return `#${channelName} is archived.`;
    if (SLACK_AUTH_ERRORS.includes(slackError)) {
      return "Slack rejected the integration's access token. Reconnect the Slack integration under Integrations > Workflow Integrations in your organization.";
    }
    return `Slack refused the message to #${channelName} (${slackError}).`;
  }
  if (code === ErrorCode.RateLimitedError) return `Slack rate limited the message to #${channelName}.`;
  if (code === ErrorCode.RequestError) return `Could not reach Slack to post to #${channelName}.`;
  return `Failed to post to #${channelName}.`;
};

export const sendSlackAppNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = SlackAppChannelConfigSchema.parse(ctx.config);
  const client = await createSlackAppClient(ctx.deps, ctx.payload.alert.orgId, config.workflowIntegrationId);
  if (!client) return { success: false, error: SLACK_INTEGRATION_MISSING_MESSAGE };

  const payload = buildSlackPayload(ctx.payload);

  const errors: string[] = [];
  for (const channel of config.channels) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one channel at a time keeps us under Slack's per-workspace rate limit
      await client.chat.postMessage({
        channel: channel.id,
        text: payload.text,
        blocks: payload.blocks,
        attachments: payload.attachments
      });
    } catch (err) {
      errors.push(describeSlackPostError(err, channel.name));
    }
  }

  const error = [...new Set(errors)].join(" ");
  if (errors.length === config.channels.length) return { success: false, error };
  if (errors.length > 0) {
    logger.warn(
      `Alert Slack app channel had partial delivery failures [alertId=${ctx.payload.alert.id}] [channelId=${ctx.channelId}]: ${error}`
    );
    return { success: true, error };
  }
  return { success: true };
};
