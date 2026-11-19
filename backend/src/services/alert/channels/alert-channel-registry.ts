import {
  AlertChannelType,
  EmailChannelConfigSchema,
  PagerDutyChannelConfigSchema,
  SlackAppChannelConfigSchema,
  SlackChannelConfigSchema,
  TAlertChannelDefinition,
  WEBHOOK_AUTH_SECRET_FIELD_BY_TYPE,
  WebhookChannelConfigSchema
} from "../alert-channel-types";
import { sendEmailNotification } from "./alert-channel-email-fns";
import { PAGERDUTY_MAX_INCIDENTS_PER_RUN, sendPagerDutyNotification } from "./alert-channel-pagerduty-fns";
import {
  assertSlackAppConfigInScope,
  getSlackAppWorkflowIntegrationId,
  SLACK_APP_REQUIRED_ORG_PERMISSION,
  sendSlackAppNotification
} from "./alert-channel-slack-app-fns";
import { sendSlackNotification } from "./alert-channel-slack-fns";
import { assertWebhookUrlUnchangedForKeptCredentials, sendWebhookNotification } from "./alert-channel-webhook-fns";

export const ALERT_CHANNEL_REGISTRY: Record<AlertChannelType, TAlertChannelDefinition> = {
  [AlertChannelType.EMAIL]: {
    type: AlertChannelType.EMAIL,
    directed: true,
    secretFields: [],
    configSchema: EmailChannelConfigSchema,
    send: sendEmailNotification
  },
  [AlertChannelType.SLACK]: {
    type: AlertChannelType.SLACK,
    directed: false,
    secretFields: ["webhookUrl"],
    configSchema: SlackChannelConfigSchema,
    send: sendSlackNotification
  },
  [AlertChannelType.SLACK_APP]: {
    type: AlertChannelType.SLACK_APP,
    directed: false,
    secretFields: [],
    configSchema: SlackAppChannelConfigSchema,
    assertConfigInScope: assertSlackAppConfigInScope,
    getWorkflowIntegrationId: getSlackAppWorkflowIntegrationId,
    requiredOrgPermission: SLACK_APP_REQUIRED_ORG_PERMISSION,
    send: sendSlackAppNotification
  },
  [AlertChannelType.WEBHOOK]: {
    type: AlertChannelType.WEBHOOK,
    directed: false,
    secretFields: ["signingSecret", ...Object.values(WEBHOOK_AUTH_SECRET_FIELD_BY_TYPE)],
    configSchema: WebhookChannelConfigSchema,
    assertStoredSecretsReusable: assertWebhookUrlUnchangedForKeptCredentials,
    send: sendWebhookNotification
  },
  [AlertChannelType.PAGERDUTY]: {
    type: AlertChannelType.PAGERDUTY,
    directed: false,
    secretFields: ["integrationKey"],
    configSchema: PagerDutyChannelConfigSchema,
    maxTargetsPerRun: PAGERDUTY_MAX_INCIDENTS_PER_RUN,
    send: sendPagerDutyNotification
  }
};
