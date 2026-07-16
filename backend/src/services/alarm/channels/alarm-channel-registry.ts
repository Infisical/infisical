import {
  AlarmChannelType,
  EmailChannelConfigSchema,
  InAppChannelConfigSchema,
  PagerDutyChannelConfigSchema,
  SlackChannelConfigSchema,
  TAlarmChannelDefinition,
  WebhookChannelConfigSchema
} from "../alarm-channel-types";
import { sendEmailNotification } from "./alarm-channel-email-fns";
import { sendInAppNotification } from "./alarm-channel-inapp-fns";
import { sendPagerDutyNotification } from "./alarm-channel-pagerduty-fns";
import { sendSlackNotification } from "./alarm-channel-slack-fns";
import { sendWebhookNotification } from "./alarm-channel-webhook-fns";

export const ALARM_CHANNEL_REGISTRY: Record<AlarmChannelType, TAlarmChannelDefinition> = {
  [AlarmChannelType.IN_APP]: {
    type: AlarmChannelType.IN_APP,
    directed: true,
    configSchema: InAppChannelConfigSchema,
    send: sendInAppNotification
  },
  [AlarmChannelType.EMAIL]: {
    type: AlarmChannelType.EMAIL,
    directed: true,
    configSchema: EmailChannelConfigSchema,
    send: sendEmailNotification
  },
  [AlarmChannelType.SLACK]: {
    type: AlarmChannelType.SLACK,
    directed: false,
    configSchema: SlackChannelConfigSchema,
    send: sendSlackNotification
  },
  [AlarmChannelType.WEBHOOK]: {
    type: AlarmChannelType.WEBHOOK,
    directed: false,
    configSchema: WebhookChannelConfigSchema,
    send: sendWebhookNotification
  },
  [AlarmChannelType.PAGERDUTY]: {
    type: AlarmChannelType.PAGERDUTY,
    directed: false,
    configSchema: PagerDutyChannelConfigSchema,
    send: sendPagerDutyNotification
  }
};

export const getAlarmChannelDefinition = (type: AlarmChannelType): TAlarmChannelDefinition =>
  ALARM_CHANNEL_REGISTRY[type];
