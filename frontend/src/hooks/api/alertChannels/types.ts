import { z } from "zod";

import { AlertChannelType, AlertPrincipalType } from "../alerts/types";

export type TAlertChannelRecipient = {
  principalType: AlertPrincipalType;
  principalId: string;
};

export type TAlertChannel = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  directed: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  recipients: TAlertChannelRecipient[];
  usageCount: number;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TListAlertChannelsDTO = {
  projectId?: string;
};

export type TCreateAlertChannelDTO = {
  name: string;
  channelType: AlertChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TAlertChannelRecipient[];
  projectId?: string | null;
};

export type TUpdateAlertChannelDTO = {
  channelId: string;
  // Carried only for cache invalidation; not sent to the API.
  projectId?: string | null;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TAlertChannelRecipient[];
};

export type TDeleteAlertChannelDTO = {
  channelId: string;
  projectId?: string | null;
};

// A recipient chosen in the channel form. `label` is display-only (not sent to the API).
export const alertChannelRecipientFormSchema = z.object({
  principalType: z.nativeEnum(AlertPrincipalType),
  principalId: z.string().min(1),
  label: z.string().optional()
});

export type TAlertChannelRecipientForm = z.infer<typeof alertChannelRecipientFormSchema>;

// The channel form flattens per-type config into named fields; a superRefine enforces the
// per-type required fields. On edit, required secrets may be left blank to keep the existing value.
export const buildChannelFormSchema = (isEditing: boolean) =>
  z
    .object({
      name: z.string().min(1, "Name is required").max(255),
      channelType: z.nativeEnum(AlertChannelType),
      enabled: z.boolean().default(true),
      // slack
      webhookUrl: z.string().optional(),
      // webhook
      url: z.string().optional(),
      signingSecret: z.string().optional(),
      // pagerduty
      integrationKey: z.string().optional(),
      // email
      recipients: z.array(alertChannelRecipientFormSchema).optional()
    })
    .superRefine((data, ctx) => {
      if (data.channelType === AlertChannelType.Slack && !isEditing && !data.webhookUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhookUrl"],
          message: "Slack webhook URL is required"
        });
      }
      if (data.channelType === AlertChannelType.Slack && data.webhookUrl) {
        try {
          const parsed = new URL(data.webhookUrl);
          if (parsed.protocol !== "https:" || parsed.hostname !== "hooks.slack.com") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["webhookUrl"],
              message: "Must be a valid https://hooks.slack.com/... URL"
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["webhookUrl"],
            message: "Must be a valid URL"
          });
        }
      }
      if (data.channelType === AlertChannelType.Webhook) {
        if (!data.url || !data.url.startsWith("https://")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["url"],
            message: "Webhook URL must be a valid HTTPS URL"
          });
        }
      }
      if (data.channelType === AlertChannelType.PagerDuty) {
        if (!isEditing && !data.integrationKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["integrationKey"],
            message: "Integration key is required"
          });
        }
        if (data.integrationKey && !/^[a-f0-9]{32}$/i.test(data.integrationKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["integrationKey"],
            message: "Integration key must be a 32-character hex string"
          });
        }
      }
      if (
        data.channelType === AlertChannelType.Email &&
        (!data.recipients || data.recipients.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients"],
          message: "At least one recipient is required"
        });
      }
    });

export type TAlertChannelForm = z.infer<ReturnType<typeof buildChannelFormSchema>>;
