import { z } from "zod";

import {
  AlertPrincipalType,
  channelFormSchema,
  TAlert,
  TAlertChannelRecipient,
  TChannelForm
} from "@app/hooks/api/alerts";

export const CERTIFICATE_ALERT_RESOURCE_TYPE = "cert-manager.application";

export enum CertificateAlertEvent {
  Expiry = "cert-manager.application.certificate.expiry",
  Issuance = "cert-manager.application.certificate.issuance",
  Renewal = "cert-manager.application.certificate.renewal",
  Revocation = "cert-manager.application.certificate.revocation"
}

export const CERTIFICATE_ALERT_EVENT_LABELS: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "Certificate Expiration",
  [CertificateAlertEvent.Issuance]: "Certificate Issuance",
  [CertificateAlertEvent.Renewal]: "Certificate Renewal",
  [CertificateAlertEvent.Revocation]: "Certificate Revocation"
};

export const CERTIFICATE_ALERT_EVENT_DESCRIPTIONS: Record<CertificateAlertEvent, string> = {
  [CertificateAlertEvent.Expiry]: "Fires ahead of a certificate's expiry date.",
  [CertificateAlertEvent.Issuance]:
    "Fires when Infisical issues a certificate in this application.",
  [CertificateAlertEvent.Renewal]: "Fires when a certificate in this application is renewed.",
  [CertificateAlertEvent.Revocation]: "Fires when a certificate in this application is revoked."
};

const MAX_ALERT_BEFORE_DAYS = 365;
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
    eventType: z.nativeEnum(CertificateAlertEvent),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    alertBefore: z.string().trim(),
    dailyReminder: z.boolean(),
    enabled: z.boolean(),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    if (form.eventType !== CertificateAlertEvent.Expiry) return;
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

export const STEP_FIELDS: (keyof TCertificateAlertForm)[][] = [
  ["eventType", "name", "description", "alertBefore", "dailyReminder"],
  ["channels"]
];

export const emptyCertificateAlertForm = (): TCertificateAlertForm => ({
  eventType: CertificateAlertEvent.Expiry,
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
  eventType: alert.eventType as CertificateAlertEvent,
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
  form.eventType === CertificateAlertEvent.Expiry
    ? { alertBefore: form.alertBefore.trim(), dailyReminder: form.dailyReminder }
    : null;
