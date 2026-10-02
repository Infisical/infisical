import { z } from "zod";

import {
  AlertPrincipalType,
  CertificateAlertEventType,
  channelFormSchema,
  MAX_CERTIFICATE_ALERT_BEFORE_DAYS,
  MAX_CERTIFICATE_ALERT_FILTER_IDS,
  TAlert,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

export enum CertificateAlertScopeKind {
  Application = "application",
  CertificateManager = "certificate-manager"
}

export type TCertificateAlertScope =
  | { kind: CertificateAlertScopeKind.Application; applicationId: string; applicationName: string }
  | { kind: CertificateAlertScopeKind.CertificateManager };

export const getAlertResourceId = (scope: TCertificateAlertScope) =>
  scope.kind === CertificateAlertScopeKind.Application ? scope.applicationId : null;

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<CertificateAlertEventType, string> = {
  [CertificateAlertEventType.Expiry]: "Certificate Expiration",
  [CertificateAlertEventType.Issuance]: "Certificate Issuance",
  [CertificateAlertEventType.Renewal]: "Certificate Renewal",
  [CertificateAlertEventType.Revocation]: "Certificate Revocation"
};

const ALERT_EVENT_DESCRIPTIONS: Record<CertificateAlertEventType, (where: string) => string> = {
  [CertificateAlertEventType.Expiry]: () => "Fires ahead of a certificate's expiry date.",
  [CertificateAlertEventType.Issuance]: (where) =>
    `Fires when Infisical issues a certificate ${where}.`,
  [CertificateAlertEventType.Renewal]: (where) => `Fires when a certificate ${where} is renewed.`,
  [CertificateAlertEventType.Revocation]: (where) => `Fires when a certificate ${where} is revoked.`
};

export const getAlertEventDescription = (
  scope: TCertificateAlertScope,
  eventType: CertificateAlertEventType
) =>
  ALERT_EVENT_DESCRIPTIONS[eventType](
    scope.kind === CertificateAlertScopeKind.Application
      ? "in this application"
      : "in Certificate Manager"
  );

export const MAX_CHANNELS = 10;

const ALERT_BEFORE_PATTERN = /^(\d{1,4})([dwmy])$/;
const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const alertBeforeToDays = (alertBefore: string): number | null => {
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  return match ? parseInt(match[1], 10) * DAYS_PER_UNIT[match[2]] : null;
};

const ALERT_BEFORE_UNIT_LABELS: Record<string, string> = {
  d: "day",
  w: "week",
  m: "month",
  y: "year"
};

export const formatAlertBefore = (alertBefore?: string | null, fallback = "-"): string => {
  if (!alertBefore) return fallback;
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  if (!match) return alertBefore;
  const value = parseInt(match[1], 10);
  return `${value} ${ALERT_BEFORE_UNIT_LABELS[match[2]]}${value === 1 ? "" : "s"}`;
};

export const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type TMemberEmails = {
  emailByUserId: Map<string, string>;
  memberIdByEmail: Map<string, string>;
  isAvailable: boolean;
};

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

export type TCertificateFilterKind = "applicationIds" | "profileIds";

export const CERTIFICATE_FILTER_DEFINITIONS: Record<
  TCertificateFilterKind,
  { label: string; hint: string; allLabel: string; unknownLabel: string }
> = {
  applicationIds: {
    label: "Applications",
    hint: "Certificates in one of these applications",
    allLabel: "All applications",
    unknownLabel: "Unknown application"
  },
  profileIds: {
    label: "Certificate Profiles",
    hint: "Issued from one of these profiles",
    allLabel: "All certificate profiles",
    unknownLabel: "Unknown profile"
  }
};

export const NO_FILTERS_DESCRIPTION =
  "No filters. This alert covers every certificate in Certificate Manager.";

export const getFilterName = (
  kind: TCertificateFilterKind,
  id: string,
  conditionNames: Record<string, string>
) => conditionNames[id] ?? CERTIFICATE_FILTER_DEFINITIONS[kind].unknownLabel;

export const toConditionNames = (alert: TAlert): Record<string, string> =>
  Object.fromEntries(
    Object.values(alert.filters ?? {})
      .flat()
      .flatMap(({ id, name }) => (name ? [[id, name]] : []))
  );

export const isUnfinishedFilter = (ids?: string[]) => ids?.length === 0;

export const hasUnfinishedFilter = (filters: Partial<Record<TCertificateFilterKind, string[]>>) =>
  isUnfinishedFilter(filters.applicationIds) || isUnfinishedFilter(filters.profileIds);

const UNFINISHED_FILTER_MESSAGES: Record<TCertificateFilterKind, string> = {
  applicationIds: "Select at least one application, or remove this filter",
  profileIds: "Select at least one profile, or remove this filter"
};

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
    subtitle: "Narrow which certificates this alert covers, or leave it on every certificate."
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
  (scope.kind === CertificateAlertScopeKind.CertificateManager
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
    eventType: z.nativeEnum(CertificateAlertEventType),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    alertBefore: z.string().trim(),
    dailyReminder: z.boolean(),
    enabled: z.boolean(),
    applicationIds: z
      .array(z.string())
      .max(
        MAX_CERTIFICATE_ALERT_FILTER_IDS,
        `Select up to ${MAX_CERTIFICATE_ALERT_FILTER_IDS} applications`
      )
      .optional(),
    profileIds: z
      .array(z.string())
      .max(
        MAX_CERTIFICATE_ALERT_FILTER_IDS,
        `Select up to ${MAX_CERTIFICATE_ALERT_FILTER_IDS} profiles`
      )
      .optional(),
    conditionNames: z.record(z.string()),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    (Object.keys(UNFINISHED_FILTER_MESSAGES) as TCertificateFilterKind[]).forEach((kind) => {
      if (isUnfinishedFilter(form[kind])) {
        ctx.addIssue({ code: "custom", path: [kind], message: UNFINISHED_FILTER_MESSAGES[kind] });
      }
    });
    if (form.eventType !== CertificateAlertEventType.Expiry) return;
    const days = alertBeforeToDays(form.alertBefore);
    if (days === null) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: "Use a number and a unit, for example 30d"
      });
    } else if (days < 1 || days > MAX_CERTIFICATE_ALERT_BEFORE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: `Must be between 1 and ${MAX_CERTIFICATE_ALERT_BEFORE_DAYS} days`
      });
    }
  });

export type TCertificateAlertForm = z.infer<typeof certificateAlertFormSchema>;

export const STEP_FIELDS: Partial<Record<CertificateAlertStep, (keyof TCertificateAlertForm)[]>> = {
  [CertificateAlertStep.Details]: [
    "eventType",
    "name",
    "description",
    "alertBefore",
    "dailyReminder"
  ],
  [CertificateAlertStep.Filters]: ["applicationIds", "profileIds"],
  [CertificateAlertStep.Channels]: ["channels"]
};

export const emptyCertificateAlertForm = (
  eventType = CertificateAlertEventType.Expiry
): TCertificateAlertForm => ({
  eventType,
  name: "",
  description: "",
  alertBefore: "30d",
  dailyReminder: false,
  enabled: true,
  conditionNames: {},
  channels: []
});

export const toCertificateAlertForm = (
  alert: TAlert,
  { emailByUserId, isAvailable }: Pick<TMemberEmails, "emailByUserId" | "isAvailable">
): TCertificateAlertForm => ({
  eventType: alert.eventType as CertificateAlertEventType,
  name: alert.name,
  description: alert.description ?? "",
  alertBefore: alert.condition?.alertBefore ?? "30d",
  dailyReminder: alert.condition?.dailyReminder ?? false,
  enabled: alert.enabled,
  applicationIds: alert.condition?.applicationIds,
  profileIds: alert.condition?.profileIds,
  conditionNames: toConditionNames(alert),
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
