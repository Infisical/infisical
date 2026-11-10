import { HashIcon, MailIcon } from "lucide-react";
import { z } from "zod";

import type { IconName } from "@app/components/v4/ui/icon";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  AlertChannelType,
  AlertPrincipalType,
  AlertRunStatus,
  CertificateAlertResourceType,
  CertificateApplicationAlertEventType,
  CertificateManagerAlertEventType,
  channelFormSchema,
  MAX_CERTIFICATE_ALERT_BEFORE_DAYS,
  MAX_CERTIFICATE_ALERT_FILTER_IDS,
  SignerAlertEventType,
  type TAlert,
  type TAlertChannelRecipient,
  type TCertificateAlertEventType,
  type TChannelForm,
  WebhookAuthType
} from "@app/hooks/api/alerts/types";
import { toChannelForm } from "@app/hooks/api/alerts/utils";
import { CertSource } from "@app/hooks/api/certificates/enums";
import type { OrgUser } from "@app/hooks/api/users/types";
import { getCertSourceLabel } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

export const ALERT_EVENT_LABELS: Record<TCertificateAlertEventType, string> = {
  [CertificateApplicationAlertEventType.Expiry]: "Certificate expiration",
  [CertificateApplicationAlertEventType.Issuance]: "Certificate issuance",
  [CertificateApplicationAlertEventType.Renewal]: "Certificate renewal",
  [CertificateApplicationAlertEventType.Revocation]: "Certificate revocation",
  [SignerAlertEventType.CertificateExpiry]: "Signer certificate expiration"
};

export const ALERT_EVENT_DESCRIPTIONS: Record<TCertificateAlertEventType, string> = {
  [CertificateApplicationAlertEventType.Expiry]: "Fires ahead of a certificate's expiry date.",
  [CertificateApplicationAlertEventType.Issuance]:
    "Fires when Infisical issues a certificate in Certificate Manager.",
  [CertificateApplicationAlertEventType.Renewal]:
    "Fires when a certificate in Certificate Manager is renewed.",
  [CertificateApplicationAlertEventType.Revocation]:
    "Fires when a certificate in Certificate Manager is revoked.",
  [SignerAlertEventType.CertificateExpiry]:
    "Fires ahead of the expiry date of the certificate each signer currently signs with."
};

export const ALERT_EVENT_GROUPS: { label: string; events: TCertificateAlertEventType[] }[] = [
  {
    label: "Certificate lifecycle",
    events: [
      CertificateApplicationAlertEventType.Expiry,
      CertificateApplicationAlertEventType.Issuance,
      CertificateApplicationAlertEventType.Renewal,
      CertificateApplicationAlertEventType.Revocation
    ]
  },
  { label: "Code signing", events: [SignerAlertEventType.CertificateExpiry] }
];

export const isExpiryEventType = (eventType: TCertificateAlertEventType) =>
  eventType === CertificateApplicationAlertEventType.Expiry ||
  eventType === SignerAlertEventType.CertificateExpiry;

export const isSignerEventType = (eventType: TCertificateAlertEventType) =>
  eventType === SignerAlertEventType.CertificateExpiry;

const API_EVENT_TYPES: Partial<
  Record<TCertificateAlertEventType, CertificateManagerAlertEventType>
> = {
  [CertificateApplicationAlertEventType.Expiry]: CertificateManagerAlertEventType.Expiry,
  [CertificateApplicationAlertEventType.Issuance]: CertificateManagerAlertEventType.Issuance,
  [CertificateApplicationAlertEventType.Renewal]: CertificateManagerAlertEventType.Renewal,
  [CertificateApplicationAlertEventType.Revocation]: CertificateManagerAlertEventType.Revocation
};

const EVENT_TYPES_BY_API_EVENT = Object.fromEntries(
  Object.entries(API_EVENT_TYPES).map(([eventType, apiEventType]) => [apiEventType, eventType])
) as Record<string, TCertificateAlertEventType>;

export const toApiEventType = (eventType: TCertificateAlertEventType): string =>
  API_EVENT_TYPES[eventType] ?? eventType;

export const fromApiEventType = (eventType: string) =>
  EVENT_TYPES_BY_API_EVENT[eventType] ?? eventType;

export const getAlertResourceType = (eventType: TCertificateAlertEventType) =>
  eventType === SignerAlertEventType.CertificateExpiry
    ? CertificateAlertResourceType.Signer
    : CertificateAlertResourceType.CertificateManager;

export const MAX_CHANNELS = 10;

const ALERT_BEFORE_PATTERN = /^(\d{1,4})([dwmy])$/;
const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };
const ALERT_BEFORE_UNIT_LABELS: Record<string, string> = {
  d: "day",
  w: "week",
  m: "month",
  y: "year"
};

const alertBeforeToDays = (alertBefore: string): number | null => {
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  return match ? parseInt(match[1], 10) * DAYS_PER_UNIT[match[2]] : null;
};

export const formatAlertBefore = (alertBefore?: string | null) => {
  if (!alertBefore) return undefined;
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  if (!match) return alertBefore;
  const value = parseInt(match[1], 10);
  return `${value} ${ALERT_BEFORE_UNIT_LABELS[match[2]]}${value === 1 ? "" : "s"}`;
};

export const pluralize = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const LAST_RUN_BADGES: Record<
  AlertRunStatus,
  { label: string; tone: "ok" | "warn" | "bad" }
> = {
  [AlertRunStatus.Success]: { label: "Success", tone: "ok" },
  [AlertRunStatus.Partial]: { label: "Partial", tone: "warn" },
  [AlertRunStatus.Failed]: { label: "Failed", tone: "bad" }
};

export const formatRunTimestamp = (timestamp: string) =>
  new Date(timestamp)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");

export type TMemberEmails = {
  emailByUserId: Map<string, string>;
  memberIdByEmail: Map<string, string>;
  isAvailable: boolean;
};

export const canReceiveAlerts = (membership: { isActive: boolean; status: string }) =>
  membership.isActive && membership.status !== "invited";

export const toMemberEmails = (orgUsers: OrgUser[] | undefined): TMemberEmails => {
  const emailByUserId = new Map<string, string>();
  const memberIdByEmail = new Map<string, string>();
  (orgUsers ?? []).filter(canReceiveAlerts).forEach(({ user }) => {
    const email = (user.email || user.username || "").toLowerCase();
    if (!email) return;
    emailByUserId.set(user.id, email);
    memberIdByEmail.set(email, user.id);
  });
  return { emailByUserId, memberIdByEmail, isAvailable: Boolean(orgUsers) };
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
  Sources = "sources",
  Signers = "signerIds"
}

export const CERTIFICATE_FILTER_KINDS = [
  CertificateFilterKind.Applications,
  CertificateFilterKind.Profiles,
  CertificateFilterKind.Sources
] as const;

export const getFilterKinds = (eventType: TCertificateAlertEventType): CertificateFilterKind[] =>
  isSignerEventType(eventType) ? [CertificateFilterKind.Signers] : [...CERTIFICATE_FILTER_KINDS];

export const FILTER_DEFINITIONS: Record<
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
    label: "Certificate profiles",
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
  },
  [CertificateFilterKind.Signers]: {
    label: "Signers",
    noun: "signer",
    hint: "Certificates of one of these signers",
    allLabel: "All signers",
    unknownLabel: "Unknown signer"
  }
};

export const SOURCE_OPTIONS = Object.values(CertSource).map((source) => ({
  value: source,
  label: getCertSourceLabel(source)
}));

export const getNoFiltersDescription = (eventType: TCertificateAlertEventType) =>
  isSignerEventType(eventType)
    ? "This alert covers every active signer."
    : "This alert covers every certificate.";

export const getFilterName = (
  kind: CertificateFilterKind,
  id: string,
  conditionNames: Record<string, string>
) =>
  kind === CertificateFilterKind.Sources
    ? getCertSourceLabel(id as CertSource)
    : (conditionNames[id] ?? FILTER_DEFINITIONS[kind].unknownLabel);

export const toConditionNames = (alert: TAlert): Record<string, string> =>
  Object.fromEntries(
    Object.values(alert.filters ?? {})
      .flat()
      .flatMap(({ id, name }) => (name ? [[id, name]] : []))
  );

const UNFINISHED_FILTER_MESSAGES: Record<CertificateFilterKind, string> = {
  [CertificateFilterKind.Applications]: "Select at least one application, or remove this filter",
  [CertificateFilterKind.Profiles]: "Select at least one profile, or remove this filter",
  [CertificateFilterKind.Sources]: "Select at least one source, or remove this filter",
  [CertificateFilterKind.Signers]: "Select at least one signer, or remove this filter"
};

const maxIds = (noun: string) =>
  z
    .array(z.string())
    .max(
      MAX_CERTIFICATE_ALERT_FILTER_IDS,
      `Select up to ${MAX_CERTIFICATE_ALERT_FILTER_IDS} ${noun}`
    )
    .optional();

export const alertFormSchema = z
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
    applicationIds: maxIds("applications"),
    profileIds: maxIds("profiles"),
    sources: z.array(z.nativeEnum(CertSource)).optional(),
    signerIds: maxIds("signers"),
    conditionNames: z.record(z.string()),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    getFilterKinds(form.eventType).forEach((kind) => {
      if (form[kind]?.length === 0) {
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

export type TAlertForm = z.infer<typeof alertFormSchema>;

export const DETAILS_FIELDS: (keyof TAlertForm)[] = [
  "eventType",
  "name",
  "description",
  "alertBefore",
  "dailyReminder"
];

export const emptyAlertForm = (): TAlertForm => ({
  eventType: CertificateApplicationAlertEventType.Expiry,
  name: "",
  description: "",
  alertBefore: "30d",
  dailyReminder: false,
  enabled: true,
  conditionNames: {},
  channels: []
});

export const toAlertForm = (
  alert: TAlert,
  { emailByUserId, isAvailable }: Pick<TMemberEmails, "emailByUserId" | "isAvailable">
): TAlertForm => ({
  eventType: alert.eventType as TCertificateAlertEventType,
  name: alert.name,
  description: alert.description ?? "",
  alertBefore: alert.condition?.alertBefore ?? "30d",
  dailyReminder: alert.condition?.dailyReminder ?? false,
  enabled: alert.enabled,
  applicationIds: alert.condition?.applicationIds,
  profileIds: alert.condition?.profileIds,
  sources: alert.condition?.sources,
  signerIds: alert.condition?.signerIds,
  conditionNames: toConditionNames(alert),
  channels: alert.channels.map((channel): TChannelForm => ({
    ...toChannelForm(channel),
    recipients: channel.recipients.filter(
      (recipient) =>
        !isAvailable ||
        recipient.principalType !== AlertPrincipalType.User ||
        emailByUserId.has(recipient.principalId)
    )
  }))
});

export const toCondition = (form: TAlertForm) => {
  const filters = Object.fromEntries(
    getFilterKinds(form.eventType).flatMap((kind) =>
      form[kind]?.length ? [[kind, form[kind]] as const] : []
    )
  );
  if (isExpiryEventType(form.eventType)) {
    return { alertBefore: form.alertBefore.trim(), dailyReminder: form.dailyReminder, ...filters };
  }
  return Object.keys(filters).length ? filters : null;
};

export const ENTERPRISE_CHANNEL_TYPES = [
  AlertChannelType.Slack,
  AlertChannelType.Webhook,
  AlertChannelType.PagerDuty
];

export const CHANNEL_ICONS: Record<AlertChannelType, IconName | typeof MailIcon> = {
  [AlertChannelType.Email]: MailIcon,
  [AlertChannelType.Slack]: HashIcon,
  [AlertChannelType.Webhook]: "link",
  [AlertChannelType.PagerDuty]: "alert"
};

export const buildNextChannel = (
  existing: { name: string }[],
  channelType: AlertChannelType
): TChannelForm => {
  const takenNames = new Set(existing.map((channel) => channel.name));
  const baseName = ALERT_CHANNEL_TYPE_LABELS[channelType];
  let name = baseName;
  for (let suffix = 2; takenNames.has(name); suffix += 1) {
    name = `${baseName} ${suffix}`;
  }
  return {
    channelType,
    name,
    enabled: true,
    recipients: [],
    webhookUrl: "",
    url: "",
    signingSecret: "",
    headers: [],
    integrationKey: ""
  };
};

export const WEBHOOK_AUTH_COPY: Record<WebhookAuthType, { label: string; description: string }> = {
  [WebhookAuthType.Bearer]: {
    label: "Bearer token",
    description: "Sends the token as Authorization: Bearer <token>."
  },
  [WebhookAuthType.Basic]: {
    label: "Basic auth",
    description: "Sends the username and password as Authorization: Basic <credentials>."
  },
  [WebhookAuthType.Header]: {
    label: "API key",
    description: "Sends the key in the header you name, such as X-API-Key."
  }
};

export const KEEP_PLACEHOLDER = "Leave blank to keep the saved value";

export const describeChannel = (channel: TChannelForm, members: TMemberEmails): string => {
  switch (channel.channelType) {
    case AlertChannelType.Email: {
      const groupCount = channel.recipients.filter(
        (recipient) => recipient.principalType === AlertPrincipalType.Group
      ).length;
      return [
        ...toRecipientEmails(channel.recipients, members),
        ...(groupCount ? [pluralize(groupCount, "group")] : [])
      ].join(", ");
    }
    case AlertChannelType.Webhook:
      return channel.url ?? "";
    case AlertChannelType.Slack:
      return "Slack incoming webhook";
    case AlertChannelType.PagerDuty:
      return "PagerDuty Events API v2";
    default:
      return "";
  }
};
