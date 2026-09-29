import { z } from "zod";

import {
  AlertPrincipalType,
  channelFormSchema,
  TAlert,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

export enum CertificateAlertScopeKind {
  Application = "application",
  Project = "project"
}

export type TCertificateAlertScope =
  | { kind: CertificateAlertScopeKind.Application; applicationId: string; applicationName: string }
  | { kind: CertificateAlertScopeKind.Project };

export enum CertificateAlertEventKind {
  Expiry = "expiry",
  Issuance = "issuance",
  Renewal = "renewal",
  Revocation = "revocation"
}

const RESOURCE_TYPE_BY_SCOPE: Record<CertificateAlertScopeKind, string> = {
  [CertificateAlertScopeKind.Application]: "cert-manager.application",
  [CertificateAlertScopeKind.Project]: "cert-manager.certificate"
};

const EVENT_PREFIX_BY_SCOPE: Record<CertificateAlertScopeKind, string> = {
  [CertificateAlertScopeKind.Application]: "cert-manager.application.certificate",
  [CertificateAlertScopeKind.Project]: "cert-manager.certificate"
};

export const getAlertResourceType = (scope: TCertificateAlertScope) =>
  RESOURCE_TYPE_BY_SCOPE[scope.kind];

export const getAlertResourceId = (scope: TCertificateAlertScope) =>
  scope.kind === CertificateAlertScopeKind.Application ? scope.applicationId : null;

export const toAlertEventType = (
  scope: TCertificateAlertScope,
  eventKind: CertificateAlertEventKind
) => `${EVENT_PREFIX_BY_SCOPE[scope.kind]}.${eventKind}`;

export const toAlertEventKind = (eventType: string) =>
  eventType.slice(eventType.lastIndexOf(".") + 1) as CertificateAlertEventKind;

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<CertificateAlertEventKind, string> = {
  [CertificateAlertEventKind.Expiry]: "Certificate Expiration",
  [CertificateAlertEventKind.Issuance]: "Certificate Issuance",
  [CertificateAlertEventKind.Renewal]: "Certificate Renewal",
  [CertificateAlertEventKind.Revocation]: "Certificate Revocation"
};

const ALERT_EVENT_DESCRIPTIONS: Record<CertificateAlertEventKind, (where: string) => string> = {
  [CertificateAlertEventKind.Expiry]: () => "Fires ahead of a certificate's expiry date.",
  [CertificateAlertEventKind.Issuance]: (where) =>
    `Fires when Infisical issues a certificate ${where}.`,
  [CertificateAlertEventKind.Renewal]: (where) => `Fires when a certificate ${where} is renewed.`,
  [CertificateAlertEventKind.Revocation]: (where) => `Fires when a certificate ${where} is revoked.`
};

export const getAlertEventDescription = (
  scope: TCertificateAlertScope,
  eventKind: CertificateAlertEventKind
) =>
  ALERT_EVENT_DESCRIPTIONS[eventKind](
    scope.kind === CertificateAlertScopeKind.Application
      ? "in this application"
      : "in Certificate Manager"
  );

const MAX_ALERT_BEFORE_DAYS = 365;
const MAX_SCOPE_FILTER_IDS = 100;
export const MAX_CHANNELS = 10;

const ALERT_BEFORE_PATTERN = /^(\d{1,4})([dwmy])$/;
const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const alertBeforeToDays = (alertBefore: string): number | null => {
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  return match ? parseInt(match[1], 10) * DAYS_PER_UNIT[match[2]] : null;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type TProjectMemberEmails = {
  emailByUserId: Map<string, string>;
  memberIdByEmail: Map<string, string>;
  isAvailable: boolean;
};

export const toRecipientEmails = (
  recipients: TAlertChannelRecipient[],
  { emailByUserId }: Pick<TProjectMemberEmails, "emailByUserId">
) =>
  recipients.flatMap((recipient) => {
    if (recipient.principalType === AlertPrincipalType.User) {
      const email = emailByUserId.get(recipient.principalId);
      return email ? [email] : [];
    }
    return recipient.principalType === AlertPrincipalType.Email ? [recipient.principalId] : [];
  });

export enum CertificateAlertStep {
  Details = "details",
  Filters = "filters",
  Channels = "channels",
  Review = "review"
}

const STEP_DEFINITIONS = {
  [CertificateAlertStep.Details]: {
    name: "Details",
    shortDescription: "Event and name",
    title: "Alert Details",
    subtitle: "Choose the event that triggers this alert and name it."
  },
  [CertificateAlertStep.Filters]: {
    name: "Filters",
    shortDescription: "Which certificates",
    title: "Certificate Filters",
    subtitle: "Narrow which certificates this alert watches, or leave it on every certificate."
  },
  [CertificateAlertStep.Channels]: {
    name: "Channels",
    shortDescription: "Where it is sent",
    title: "Notification Channels",
    subtitle: "Add at least one destination for this alert."
  },
  [CertificateAlertStep.Review]: {
    name: "Review",
    shortDescription: "Confirm and save",
    title: "Review",
    subtitle: "Check the settings below before saving this alert."
  }
};

export const getSteps = (scope: TCertificateAlertScope) =>
  (scope.kind === CertificateAlertScopeKind.Project
    ? [
        CertificateAlertStep.Details,
        CertificateAlertStep.Filters,
        CertificateAlertStep.Channels,
        CertificateAlertStep.Review
      ]
    : [CertificateAlertStep.Details, CertificateAlertStep.Channels, CertificateAlertStep.Review]
  ).map((key) => ({ key, ...STEP_DEFINITIONS[key] }));

export const certificateAlertFormSchema = z
  .object({
    eventKind: z.nativeEnum(CertificateAlertEventKind),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    alertBefore: z.string().trim(),
    dailyReminder: z.boolean(),
    enabled: z.boolean(),
    applicationIds: z
      .array(z.string())
      .max(MAX_SCOPE_FILTER_IDS, `Select up to ${MAX_SCOPE_FILTER_IDS} applications`)
      .optional(),
    profileIds: z
      .array(z.string())
      .max(MAX_SCOPE_FILTER_IDS, `Select up to ${MAX_SCOPE_FILTER_IDS} profiles`)
      .optional(),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    if (form.applicationIds?.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["applicationIds"],
        message: "Select at least one application, or remove this filter"
      });
    }
    if (form.profileIds?.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["profileIds"],
        message: "Select at least one profile, or remove this filter"
      });
    }
    if (form.eventKind !== CertificateAlertEventKind.Expiry) return;
    const days = alertBeforeToDays(form.alertBefore);
    if (days === null) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: "Use a number and a unit, for example 30d"
      });
    } else if (days < 1 || days > MAX_ALERT_BEFORE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: `Must be between 1 and ${MAX_ALERT_BEFORE_DAYS} days`
      });
    }
  });

export type TCertificateAlertForm = z.infer<typeof certificateAlertFormSchema>;

export const STEP_FIELDS: Partial<Record<CertificateAlertStep, (keyof TCertificateAlertForm)[]>> = {
  [CertificateAlertStep.Details]: [
    "eventKind",
    "name",
    "description",
    "alertBefore",
    "dailyReminder"
  ],
  [CertificateAlertStep.Filters]: ["applicationIds", "profileIds"],
  [CertificateAlertStep.Channels]: ["channels"]
};

export const hasUnfinishedFilter = (
  form: Pick<TCertificateAlertForm, "applicationIds" | "profileIds">
) => form.applicationIds?.length === 0 || form.profileIds?.length === 0;

export const emptyCertificateAlertForm = (): TCertificateAlertForm => ({
  eventKind: CertificateAlertEventKind.Expiry,
  name: "",
  description: "",
  alertBefore: "30d",
  dailyReminder: false,
  enabled: true,
  channels: []
});

export const toCertificateAlertForm = (
  alert: TAlert,
  { emailByUserId, isAvailable }: Pick<TProjectMemberEmails, "emailByUserId" | "isAvailable">
): TCertificateAlertForm => ({
  eventKind: toAlertEventKind(alert.eventType),
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
  const scopeFilters =
    scope.kind === CertificateAlertScopeKind.Project
      ? {
          ...(form.applicationIds?.length ? { applicationIds: form.applicationIds } : {}),
          ...(form.profileIds?.length ? { profileIds: form.profileIds } : {})
        }
      : {};

  if (form.eventKind === CertificateAlertEventKind.Expiry) {
    return {
      alertBefore: form.alertBefore.trim(),
      dailyReminder: form.dailyReminder,
      ...scopeFilters
    };
  }
  return Object.keys(scopeFilters).length ? scopeFilters : null;
};
