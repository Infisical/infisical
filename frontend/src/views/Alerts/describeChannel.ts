import {
  ALERT_PROJECT_RECIPIENT_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const describeRecipientType = (principalType: AlertPrincipalType, count: number) => {
  switch (principalType) {
    case AlertPrincipalType.ProjectMembers:
    case AlertPrincipalType.ProjectAdmins:
      return ALERT_PROJECT_RECIPIENT_LABELS[principalType];
    case AlertPrincipalType.User:
      return pluralize(count, "user");
    case AlertPrincipalType.Group:
      return pluralize(count, "group");
    case AlertPrincipalType.Email:
      return pluralize(count, "email");
    default:
      return "";
  }
};

const describeRecipients = (recipients: TAlertChannelRecipient[]) =>
  Object.values(AlertPrincipalType)
    .map((principalType) => ({
      principalType,
      count: recipients.filter((recipient) => recipient.principalType === principalType).length
    }))
    .filter(({ count }) => count > 0)
    .map(({ principalType, count }) => describeRecipientType(principalType, count))
    .join(", ");

const describeSlackChannels = (channels: { name: string }[] = []) =>
  channels.map((slackChannel) => `#${slackChannel.name}`).join(", ");

export const describeChannel = (channel: TChannelForm) => {
  switch (channel.channelType) {
    case AlertChannelType.Email:
      return describeRecipients(channel.recipients);
    case AlertChannelType.SlackApp:
      return describeSlackChannels(channel.slackChannels);
    case AlertChannelType.Slack:
      return "Slack incoming webhook";
    case AlertChannelType.Webhook:
      return channel.url;
    case AlertChannelType.PagerDuty:
      return "PagerDuty Events API v2";
    default:
      return "";
  }
};
