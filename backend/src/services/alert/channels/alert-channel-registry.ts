import {
  AlertChannelType,
  EmailChannelConfigSchema,
  PagerDutyChannelConfigSchema,
  SlackChannelConfigSchema,
  TAlertChannelDefinition,
  WebhookChannelConfigSchema
} from "../alert-channel-types";
import { sendEmailNotification } from "./alert-channel-email-fns";
import { PAGERDUTY_MAX_INCIDENTS_PER_RUN, sendPagerDutyNotification } from "./alert-channel-pagerduty-fns";
import { sendSlackNotification } from "./alert-channel-slack-fns";
import { sendWebhookNotification } from "./alert-channel-webhook-fns";

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
  [AlertChannelType.WEBHOOK]: {
    type: AlertChannelType.WEBHOOK,
    directed: false,
    secretFields: ["signingSecret"],
    configSchema: WebhookChannelConfigSchema,
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
