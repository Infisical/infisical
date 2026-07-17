import {
  AlarmChannelType,
  EmailChannelConfigSchema,
  PagerDutyChannelConfigSchema,
  SlackChannelConfigSchema,
  TAlarmChannelDefinition,
  WebhookChannelConfigSchema
} from "../alarm-channel-types";
import { sendEmailNotification } from "./alarm-channel-email-fns";
import { PAGERDUTY_MAX_INCIDENTS_PER_RUN, sendPagerDutyNotification } from "./alarm-channel-pagerduty-fns";
import { sendSlackNotification } from "./alarm-channel-slack-fns";
import { sendWebhookNotification } from "./alarm-channel-webhook-fns";

export const ALARM_CHANNEL_REGISTRY: Record<AlarmChannelType, TAlarmChannelDefinition> = {
  [AlarmChannelType.EMAIL]: {
    type: AlarmChannelType.EMAIL,
    directed: true,
    secretFields: [],
    configSchema: EmailChannelConfigSchema,
    send: sendEmailNotification
  },
  [AlarmChannelType.SLACK]: {
    type: AlarmChannelType.SLACK,
    directed: false,
    secretFields: ["webhookUrl"],
    configSchema: SlackChannelConfigSchema,
    send: sendSlackNotification
  },
  [AlarmChannelType.WEBHOOK]: {
    type: AlarmChannelType.WEBHOOK,
    directed: false,
    secretFields: ["signingSecret"],
    configSchema: WebhookChannelConfigSchema,
    send: sendWebhookNotification
  },
  [AlarmChannelType.PAGERDUTY]: {
    type: AlarmChannelType.PAGERDUTY,
    directed: false,
    secretFields: ["integrationKey"],
    configSchema: PagerDutyChannelConfigSchema,
    maxTargetsPerRun: PAGERDUTY_MAX_INCIDENTS_PER_RUN,
    send: sendPagerDutyNotification
  }
};
