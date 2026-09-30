import { z } from "zod";

import {
  AlertPrincipalType,
  CertificateAlertEventType,
  channelFormSchema,
  MAX_CERTIFICATE_ALERT_BEFORE_DAYS,
  TAlert,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<CertificateAlertEventType, string> = {
  [CertificateAlertEventType.Expiry]: "Certificate Expiration",
  [CertificateAlertEventType.Issuance]: "Certificate Issuance",
  [CertificateAlertEventType.Renewal]: "Certificate Renewal",
  [CertificateAlertEventType.Revocation]: "Certificate Revocation"
};

export const CERTIFICATE_ALERT_EVENT_DESCRIPTIONS: Record<CertificateAlertEventType, string> = {
  [CertificateAlertEventType.Expiry]: "Fires ahead of a certificate's expiry date.",
  [CertificateAlertEventType.Issuance]:
    "Fires when Infisical issues a certificate in this application.",
  [CertificateAlertEventType.Renewal]: "Fires when a certificate in this application is renewed.",
  [CertificateAlertEventType.Revocation]: "Fires when a certificate in this application is revoked."
};

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

export const STEPS = [
  {
    name: "Details",
    shortDescription: "Event and name",
    title: "Alert Details",
    subtitle: "Choose the event that triggers this alert and name it."
  },
  {
    name: "Channels",
    shortDescription: "Where it is sent",
    title: "Notification Channels",
    subtitle: "Add at least one destination for this alert."
  },
  {
    name: "Review",
    shortDescription: "Confirm and save",
    title: "Review",
    subtitle: "Check the settings below before saving this alert."
  }
] as const;

export const certificateAlertFormSchema = z
  .object({
    eventType: z.nativeEnum(CertificateAlertEventType),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    alertBefore: z.string().trim(),
    dailyReminder: z.boolean(),
    enabled: z.boolean(),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
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

export const STEP_FIELDS: (keyof TCertificateAlertForm)[][] = [
  ["eventType", "name", "description", "alertBefore", "dailyReminder"],
  ["channels"]
];

export const emptyCertificateAlertForm = (
  eventType = CertificateAlertEventType.Expiry
): TCertificateAlertForm => ({
  eventType,
  name: "",
  description: "",
  alertBefore: "30d",
  dailyReminder: false,
  enabled: true,
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

export const toCondition = (form: TCertificateAlertForm) =>
  form.eventType === CertificateAlertEventType.Expiry
    ? { alertBefore: form.alertBefore.trim(), dailyReminder: form.dailyReminder }
    : null;
