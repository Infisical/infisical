import {
  AlertPrincipalType,
  ApplicationCertificateAlertEventType,
  CertificateAlertEventType,
  CertificateAlertResourceType,
  TAlert,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

import { TCertificateAlertForm } from "./certificate-alert-schema";
import { CertificateAlertScopeKind, TCertificateAlertScope, TMemberEmails } from "./types";

const ALERT_EVENT_TYPE_BY_SCOPE: Record<
  CertificateAlertScopeKind,
  Record<CertificateAlertEventType, string>
> = {
  [CertificateAlertScopeKind.Application]: {
    [CertificateAlertEventType.Expiry]: ApplicationCertificateAlertEventType.Expiry,
    [CertificateAlertEventType.Issuance]: ApplicationCertificateAlertEventType.Issuance,
    [CertificateAlertEventType.Renewal]: ApplicationCertificateAlertEventType.Renewal,
    [CertificateAlertEventType.Revocation]: ApplicationCertificateAlertEventType.Revocation
  },
  [CertificateAlertScopeKind.CertificateManager]: {
    [CertificateAlertEventType.Expiry]: CertificateAlertEventType.Expiry,
    [CertificateAlertEventType.Issuance]: CertificateAlertEventType.Issuance,
    [CertificateAlertEventType.Renewal]: CertificateAlertEventType.Renewal,
    [CertificateAlertEventType.Revocation]: CertificateAlertEventType.Revocation
  }
};

export const getAlertResourceType = (scope: TCertificateAlertScope) =>
  scope.kind === CertificateAlertScopeKind.Application
    ? CertificateAlertResourceType.Application
    : CertificateAlertResourceType.Certificate;

export const getAlertResourceId = (scope: TCertificateAlertScope) =>
  scope.kind === CertificateAlertScopeKind.Application ? scope.applicationId : null;

export const toAlertEventType = (
  scope: TCertificateAlertScope,
  eventType: CertificateAlertEventType
) => ALERT_EVENT_TYPE_BY_SCOPE[scope.kind][eventType];

export const fromAlertEventType = (
  scope: TCertificateAlertScope,
  alertEventType: string
): CertificateAlertEventType | undefined =>
  Object.values(CertificateAlertEventType).find(
    (eventType) => ALERT_EVENT_TYPE_BY_SCOPE[scope.kind][eventType] === alertEventType
  );

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const toRecipientEmails = (
  recipients: TAlertChannelRecipient[],
  { emailByUserId }: Pick<TMemberEmails, "emailByUserId">
) =>
  recipients.flatMap((recipient) => {
    if (recipient.principalType === AlertPrincipalType.User) {
      const email = emailByUserId.get(recipient.principalId);
      return email ? [email] : [];
    }
    return recipient.principalType === AlertPrincipalType.Email ? [recipient.principalId] : [];
  });

export const toCertificateAlertForm = (
  scope: TCertificateAlertScope,
  alert: TAlert,
  { emailByUserId, isAvailable }: Pick<TMemberEmails, "emailByUserId" | "isAvailable">
): TCertificateAlertForm => ({
  eventType: fromAlertEventType(scope, alert.eventType) ?? CertificateAlertEventType.Expiry,
  name: alert.name,
  description: alert.description ?? "",
  alertBefore: alert.condition?.alertBefore ?? "30d",
  dailyReminder: alert.condition?.dailyReminder ?? false,
  enabled: alert.enabled,
  applicationIds: alert.condition?.applicationIds,
  profileIds: alert.condition?.profileIds,
  channels: alert.channels.map(
    (channel): TChannelForm => ({
      id: channel.id,
      name: channel.name,
      channelType: channel.channelType,
      enabled: channel.enabled,
      recipients: channel.recipients.filter(
        (recipient) =>
          !isAvailable ||
          recipient.principalType !== AlertPrincipalType.User ||
          emailByUserId.has(recipient.principalId)
      ),
      url: (channel.config.url as string) ?? "",
      webhookUrl: "",
      signingSecret: "",
      integrationKey: "",
      hasSigningSecret: Boolean(channel.config.hasSigningSecret),
      hasWebhookUrl: Boolean(channel.config.hasWebhookUrl),
      hasIntegrationKey: Boolean(channel.config.hasIntegrationKey)
    })
  )
});

export const toCondition = (scope: TCertificateAlertScope, form: TCertificateAlertForm) => {
  const filters =
    scope.kind === CertificateAlertScopeKind.CertificateManager
      ? {
          ...(form.applicationIds?.length ? { applicationIds: form.applicationIds } : {}),
          ...(form.profileIds?.length ? { profileIds: form.profileIds } : {})
        }
      : {};

  if (form.eventType === CertificateAlertEventType.Expiry) {
    return {
      alertBefore: form.alertBefore.trim(),
      dailyReminder: form.dailyReminder,
      ...filters
    };
  }
  return Object.keys(filters).length ? filters : null;
};
