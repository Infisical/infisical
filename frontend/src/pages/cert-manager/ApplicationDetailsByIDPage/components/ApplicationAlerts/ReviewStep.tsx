import { ReactNode } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";

import { Badge } from "@app/components/v3";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  TChannelForm
} from "@app/hooks/api/alerts";

import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CertificateAlertEvent,
  TCertificateAlertForm,
  toRecipientEmails,
  TProjectMemberEmails
} from "./types";

type Props = { form: UseFormReturn<TCertificateAlertForm>; members: TProjectMemberEmails };

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-4">
    <p className="border-b border-border pb-2 text-sm font-medium text-foreground">{title}</p>
    {children}
  </div>
);

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs text-muted">{label}</span>
    <span className="text-sm text-foreground">{children}</span>
  </div>
);

const EnabledBadge = ({ enabled }: { enabled: boolean }) => (
  <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Disabled"}</Badge>
);

const describeChannel = (channel: TChannelForm, members: TProjectMemberEmails): string => {
  switch (channel.channelType) {
    case AlertChannelType.Email: {
      const groupCount = channel.recipients.filter(
        (recipient) => recipient.principalType === AlertPrincipalType.Group
      ).length;
      return [
        ...toRecipientEmails(channel.recipients, members),
        ...(groupCount ? [`${groupCount} group(s)`] : [])
      ].join(", ");
    }
    case AlertChannelType.Webhook:
      return channel.url ?? "";
    case AlertChannelType.Slack:
      return "Slack Incoming Webhook";
    case AlertChannelType.PagerDuty:
      return "PagerDuty Events API v2";
    default:
      return "";
  }
};

export const ReviewStep = ({ form, members }: Props) => {
  const values = useWatch({ control: form.control }) as TCertificateAlertForm;
  const isExpiry = values.eventType === CertificateAlertEvent.Expiry;

  return (
    <div className="flex flex-col gap-8">
      <Section title="Basic Information">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Detail label="Name">{values.name}</Detail>
          <Detail label="Alert Type">{CERTIFICATE_ALERT_EVENT_LABELS[values.eventType]}</Detail>
          <Detail label="Status">
            <EnabledBadge enabled={values.enabled} />
          </Detail>
          {isExpiry && <Detail label="Alert Before">{values.alertBefore}</Detail>}
          {isExpiry && (
            <Detail label="Repeat daily">
              <EnabledBadge enabled={values.dailyReminder} />
            </Detail>
          )}
          {values.description && <Detail label="Description">{values.description}</Detail>}
        </div>
      </Section>

      <Section title="Notification Channels">
        <div className="flex flex-col gap-3">
          {values.channels.map((channel, index) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`${channel.channelType}-${index}`}
              className="flex items-center justify-between gap-4 rounded-md border border-border bg-container px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-foreground">
                  {ALERT_CHANNEL_TYPE_LABELS[channel.channelType]}
                </span>
                <span className="truncate text-xs text-muted">
                  {describeChannel(channel, members)}
                </span>
              </div>
              <EnabledBadge enabled={channel.enabled} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};
