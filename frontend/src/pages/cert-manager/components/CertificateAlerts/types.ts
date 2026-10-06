import { z } from "zod";

import {
  AlertPrincipalType,
  CertificateAlertResourceType,
  CertificateApplicationAlertEventType,
  CertificateManagerAlertEventType,
  channelFormSchema,
  MAX_CERTIFICATE_ALERT_BEFORE_DAYS,
  MAX_CERTIFICATE_ALERT_FILTER_IDS,
  SignerAlertEventType,
  TAlert,
  TAlertChannelRecipient,
  TCertificateAlertEventType,
  TChannelForm
} from "@app/hooks/api/alerts";
import { CertSource } from "@app/hooks/api/certificates/enums";
import { getCertSourceLabel } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

export enum CertificateAlertScopeKind {
  Application = "application",
  CertificateManager = "certificate-manager"
}

export type TCertificateAlertScope =
  | { kind: CertificateAlertScopeKind.Application; applicationId: string; applicationName: string }
  | { kind: CertificateAlertScopeKind.CertificateManager };

export const getAlertResourceId = (scope: TCertificateAlertScope) =>
  scope.kind === CertificateAlertScopeKind.Application ? scope.applicationId : null;

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<TCertificateAlertEventType, string> = {
  [CertificateApplicationAlertEventType.Expiry]: "Certificate Expiration",
  [CertificateApplicationAlertEventType.Issuance]: "Certificate Issuance",
  [CertificateApplicationAlertEventType.Renewal]: "Certificate Renewal",
  [CertificateApplicationAlertEventType.Revocation]: "Certificate Revocation",
  [SignerAlertEventType.CertificateExpiry]: "Signer Certificate Expiration"
};

const CERTIFICATE_ALERT_EVENT_GROUPS: {
  label: string;
  events: TCertificateAlertEventType[];
  scopes: CertificateAlertScopeKind[];
}[] = [
  {
    label: "Certificate Lifecycle",
    events: [
      CertificateApplicationAlertEventType.Expiry,
      CertificateApplicationAlertEventType.Issuance,
      CertificateApplicationAlertEventType.Renewal,
      CertificateApplicationAlertEventType.Revocation
    ],
    scopes: [CertificateAlertScopeKind.Application, CertificateAlertScopeKind.CertificateManager]
  },
  {
    label: "Code Signing",
    events: [SignerAlertEventType.CertificateExpiry],
    scopes: [CertificateAlertScopeKind.CertificateManager]
  }
];

export const getScopeEventGroups = (scope: TCertificateAlertScope) =>
  CERTIFICATE_ALERT_EVENT_GROUPS.filter((group) => group.scopes.includes(scope.kind));

export const getScopeEventTypes = (scope: TCertificateAlertScope) =>
  getScopeEventGroups(scope).flatMap((group) => group.events);

export const isExpiryEventType = (eventType: TCertificateAlertEventType) =>
  eventType === CertificateApplicationAlertEventType.Expiry ||
  eventType === SignerAlertEventType.CertificateExpiry;

export const isFilterableEventType = (eventType: TCertificateAlertEventType) =>
  eventType !== SignerAlertEventType.CertificateExpiry;

const CERTIFICATE_MANAGER_EVENT_TYPES: Partial<
  Record<TCertificateAlertEventType, CertificateManagerAlertEventType>
> = {
  [CertificateApplicationAlertEventType.Expiry]: CertificateManagerAlertEventType.Expiry,
  [CertificateApplicationAlertEventType.Issuance]: CertificateManagerAlertEventType.Issuance,
  [CertificateApplicationAlertEventType.Renewal]: CertificateManagerAlertEventType.Renewal,
  [CertificateApplicationAlertEventType.Revocation]: CertificateManagerAlertEventType.Revocation
};

const EVENT_TYPES_BY_CERTIFICATE_MANAGER_EVENT = Object.fromEntries(
  Object.entries(CERTIFICATE_MANAGER_EVENT_TYPES).map(([eventType, apiEventType]) => [
    apiEventType,
    eventType
  ])
) as Record<string, TCertificateAlertEventType>;

export const getAlertResourceType = (
  scope: TCertificateAlertScope,
  eventType: TCertificateAlertEventType
) => {
  if (eventType === SignerAlertEventType.CertificateExpiry)
    return CertificateAlertResourceType.Signer;
  return scope.kind === CertificateAlertScopeKind.CertificateManager
    ? CertificateAlertResourceType.CertificateManager
    : CertificateAlertResourceType.Application;
};

export const toApiEventType = (
  scope: TCertificateAlertScope,
  eventType: TCertificateAlertEventType
): string =>
  (scope.kind === CertificateAlertScopeKind.CertificateManager &&
    CERTIFICATE_MANAGER_EVENT_TYPES[eventType]) ||
  eventType;

export const fromApiEventType = (eventType: string) =>
  EVENT_TYPES_BY_CERTIFICATE_MANAGER_EVENT[eventType] ?? eventType;

const ALERT_EVENT_DESCRIPTIONS: Record<TCertificateAlertEventType, (where: string) => string> = {
  [CertificateApplicationAlertEventType.Expiry]: () =>
    "Fires ahead of a certificate's expiry date.",
  [CertificateApplicationAlertEventType.Issuance]: (where) =>
    `Fires when Infisical issues a certificate ${where}.`,
  [CertificateApplicationAlertEventType.Renewal]: (where) =>
    `Fires when a certificate ${where} is renewed.`,
  [CertificateApplicationAlertEventType.Revocation]: (where) =>
    `Fires when a certificate ${where} is revoked.`,
  [SignerAlertEventType.CertificateExpiry]: () =>
    "Fires ahead of the expiry date of the certificate each signer currently signs with."
};

export const getAlertEventDescription = (
  scope: TCertificateAlertScope,
  eventType: TCertificateAlertEventType
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

export enum CertificateFilterKind {
  Applications = "applicationIds",
  Profiles = "profileIds",
  Sources = "sources"
}

export const CERTIFICATE_FILTER_DEFINITIONS: Record<
  CertificateFilterKind,
  { label: string; noun: string; hint: string; allLabel: string; unknownLabel: string }
> = {
  [CertificateFilterKind.Applications]: {
    label: "Applications",
    noun: "application",
    hint: "Certificates in one of these applications",
    allLabel: "All applications",
    unknownLabel: "Unknown application"
  },
  [CertificateFilterKind.Profiles]: {
    label: "Certificate Profiles",
    noun: "certificate profile",
    hint: "Issued from one of these profiles",
    allLabel: "All certificate profiles",
    unknownLabel: "Unknown profile"
  },
  [CertificateFilterKind.Sources]: {
    label: "Source",
    noun: "source",
    hint: "Managed, imported, or discovered certificates",
    allLabel: "All sources",
    unknownLabel: "Unknown source"
  }
};

export const NO_FILTERS_DESCRIPTION = "No filters. This alert covers every certificate.";

export const getFilterName = (
  kind: CertificateFilterKind,
  id: string,
  conditionNames: Record<string, string>
) =>
  kind === CertificateFilterKind.Sources
    ? getCertSourceLabel(id as CertSource)
    : (conditionNames[id] ?? CERTIFICATE_FILTER_DEFINITIONS[kind].unknownLabel);

export const toConditionNames = (alert: TAlert): Record<string, string> =>
  Object.fromEntries(
    Object.values(alert.filters ?? {})
      .flat()
      .flatMap(({ id, name }) => (name ? [[id, name]] : []))
  );

const isUnfinishedFilter = (ids?: string[]) => ids?.length === 0;

const UNFINISHED_FILTER_MESSAGES: Record<CertificateFilterKind, string> = {
  [CertificateFilterKind.Applications]: "Select at least one application, or remove this filter",
  [CertificateFilterKind.Profiles]: "Select at least one profile, or remove this filter",
  [CertificateFilterKind.Sources]: "Select at least one source, or remove this filter"
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

export const getSteps = (scope: TCertificateAlertScope, eventType: TCertificateAlertEventType) =>
  (scope.kind === CertificateAlertScopeKind.CertificateManager && isFilterableEventType(eventType)
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
    eventType: z.union([
      z.nativeEnum(CertificateApplicationAlertEventType),
      z.nativeEnum(SignerAlertEventType)
    ]),
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
    sources: z.array(z.nativeEnum(CertSource)).optional(),
    conditionNames: z.record(z.string()),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    Object.values(CertificateFilterKind).forEach((kind) => {
      if (isUnfinishedFilter(form[kind])) {
        ctx.addIssue({ code: "custom", path: [kind], message: UNFINISHED_FILTER_MESSAGES[kind] });
      }
    });
    if (!isExpiryEventType(form.eventType)) return;
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
  [CertificateAlertStep.Filters]: Object.values(CertificateFilterKind),
  [CertificateAlertStep.Channels]: ["channels"]
};

export const emptyCertificateAlertForm = (
  eventType: TCertificateAlertEventType = CertificateApplicationAlertEventType.Expiry
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
  eventType: alert.eventType as TCertificateAlertEventType,
  name: alert.name,
  description: alert.description ?? "",
  alertBefore: alert.condition?.alertBefore ?? "30d",
  dailyReminder: alert.condition?.dailyReminder ?? false,
  enabled: alert.enabled,
  applicationIds: alert.condition?.applicationIds,
  profileIds: alert.condition?.profileIds,
  sources: alert.condition?.sources,
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
    scope.kind === CertificateAlertScopeKind.CertificateManager &&
    isFilterableEventType(form.eventType)
      ? {
          ...(form.applicationIds?.length ? { applicationIds: form.applicationIds } : {}),
          ...(form.profileIds?.length ? { profileIds: form.profileIds } : {}),
          ...(form.sources?.length ? { sources: form.sources } : {})
        }
      : {};

  if (isExpiryEventType(form.eventType)) {
    return {
      alertBefore: form.alertBefore.trim(),
      dailyReminder: form.dailyReminder,
      ...filters
    };
  }
  return Object.keys(filters).length ? filters : null;
};
