import { ReactNode } from "react";
import { UseFormReturn, useWatch } from "react-hook-form";

import { FilterValueBadges } from "@app/components/certificate-filters";
import { Badge } from "@app/components/v3";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  CertificateAlertEventType,
  TChannelForm
} from "@app/hooks/api/alerts";

import { toRecipientEmails } from "./certificate-alert-fns";
import { TCertificateAlertForm } from "./certificate-alert-schema";
import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CERTIFICATE_FILTER_DEFINITIONS,
  CertificateAlertScopeKind,
  NO_FILTERS_DESCRIPTION,
  TCertificateAlertScope,
  TProjectMemberEmails
} from "./types";
import { useCertificateFilterNames } from "./useCertificateFilterNames";

type Props = {
  form: UseFormReturn<TCertificateAlertForm>;
  scope: TCertificateAlertScope;
  members: TProjectMemberEmails;
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-4">
    <p className="border-b border-border pb-2 text-sm font-medium text-foreground">{title}</p>
    {children}
  </div>
);

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-xs text-muted">{label}</span>
    <div className="text-sm break-words text-foreground">{children}</div>
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

const FilterDetails = ({
  applicationIds,
  profileIds
}: {
  applicationIds: string[];
  profileIds: string[];
}) => {
  const { getApplicationName, getProfileName } = useCertificateFilterNames({
    applicationIds,
    profileIds
  });

  return (
    <>
      <Detail label={CERTIFICATE_FILTER_DEFINITIONS.applicationIds.label}>
        {applicationIds.length ? (
          <FilterValueBadges values={applicationIds.map(getApplicationName)} />
        ) : (
          CERTIFICATE_FILTER_DEFINITIONS.applicationIds.allLabel
        )}
      </Detail>
      <Detail label={CERTIFICATE_FILTER_DEFINITIONS.profileIds.label}>
        {profileIds.length ? (
          <FilterValueBadges values={profileIds.map(getProfileName)} />
        ) : (
          CERTIFICATE_FILTER_DEFINITIONS.profileIds.allLabel
        )}
      </Detail>
    </>
  );
};

export const ReviewStep = ({ form, scope, members }: Props) => {
  const values = useWatch({ control: form.control }) as TCertificateAlertForm;
  const isExpiry = values.eventType === CertificateAlertEventType.Expiry;

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

      {scope.kind === CertificateAlertScopeKind.CertificateManager && (
        <Section title="Certificate Filters">
          {values.applicationIds?.length || values.profileIds?.length ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FilterDetails
                applicationIds={values.applicationIds ?? []}
                profileIds={values.profileIds ?? []}
              />
            </div>
          ) : (
            <span className="text-sm text-muted">{NO_FILTERS_DESCRIPTION}</span>
          )}
        </Section>
      )}

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
