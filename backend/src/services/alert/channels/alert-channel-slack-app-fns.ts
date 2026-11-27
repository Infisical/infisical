import { ReadFrom } from "@app/domains/lib/data-access";
import { TPermissionCheck } from "@app/domains/platform/access-control/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/domains/platform/organizations/ce/module";
import {
  ChatMessage,
  ChatPostFailure,
  WorkflowIntegrationProvider
} from "@app/domains/platform/workflow-integrations/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import {
  ALERT_CHANNEL_HTTP_TIMEOUT,
  SlackAppChannelConfigSchema,
  TAlertChannelScopeDeps,
  TAlertChannelSendContext,
  TChannelResult
} from "../alert-channel-types";
import { buildSlackPayload } from "./alert-channel-slack-fns";

const SLACK_INTEGRATION_MISSING_MESSAGE =
  "The Slack integration this channel posts through no longer exists. Edit the alert and select another Slack integration.";

export const SLACK_APP_REQUIRED_ORG_PERMISSION: { permission: TPermissionCheck<OrgPermissionSet>; message: string } = {
  permission: { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings },
  message:
    "Posting through a Slack integration needs permission to read organization settings. Ask an organization admin, or use a Slack webhook URL instead."
};

export const assertSlackAppConfigInScope = async (
  { orgId, config }: { orgId: string; config: Record<string, unknown> },
  { workflowIntegrationService }: TAlertChannelScopeDeps
) => {
  const { workflowIntegrationId } = SlackAppChannelConfigSchema.parse(config);
  // A replica can lag behind an integration that was connected moments ago.
  const slackIntegration = await workflowIntegrationService.findInOrg({
    orgId,
    id: workflowIntegrationId,
    provider: WorkflowIntegrationProvider.Slack,
    readFrom: ReadFrom.Primary
  });
  if (!slackIntegration) {
    throw new BadRequestError({
      message: `Slack integration with ID '${workflowIntegrationId}' was not found in this organization`
    });
  }
};

export const getSlackAppWorkflowIntegrationId = (config: Record<string, unknown>) =>
  SlackAppChannelConfigSchema.parse(config).workflowIntegrationId;

export const describeSlackPostError = (
  failure: ChatPostFailure,
  providerError: string | undefined,
  channelName: string
): string => {
  switch (failure) {
    case ChatPostFailure.NotInChannel:
      return `The Infisical app isn't in #${channelName}. Add it to the channel in Slack, then try again.`;
    case ChatPostFailure.ChannelNotFound:
      return `#${channelName} was not found. It may have been deleted, or it's a private channel the Infisical app isn't in.`;
    case ChatPostFailure.Archived:
      return `#${channelName} is archived.`;
    case ChatPostFailure.AuthRejected:
      return "Slack rejected the integration's access token. Reconnect the Slack integration under Integrations > Workflow Integrations in your organization.";
    case ChatPostFailure.RateLimited:
      return `Slack rate limited the message to #${channelName}.`;
    case ChatPostFailure.Unreachable:
      return `Could not reach Slack to post to #${channelName}.`;
    default:
      return providerError
        ? `Slack refused the message to #${channelName} (${providerError}).`
        : `Failed to post to #${channelName}.`;
  }
};

export const sendSlackAppNotification = async (ctx: TAlertChannelSendContext): Promise<TChannelResult> => {
  const config = SlackAppChannelConfigSchema.parse(ctx.config);
  const { chatDeliveryService } = ctx.deps;

  const result = await chatDeliveryService.post({
    orgId: ctx.payload.alert.orgId,
    integrationId: config.workflowIntegrationId,
    message: ChatMessage.slack(buildSlackPayload(ctx.payload)),
    channelIds: config.channels.map((channel) => channel.id),
    limits: { timeoutMs: ALERT_CHANNEL_HTTP_TIMEOUT, retries: 2 }
  });
  if (result.integrationMissing) return { success: false, error: SLACK_INTEGRATION_MISSING_MESSAGE };

  const channelNames = new Map(config.channels.map((channel) => [channel.id, channel.name]));
  const errors: string[] = [];
  result.channels.forEach((outcome) => {
    if (outcome.delivered) return;
    errors.push(
      describeSlackPostError(
        outcome.failure,
        outcome.providerError,
        channelNames.get(outcome.channelId) ?? outcome.channelId
      )
    );
  });

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
