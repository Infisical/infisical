import { z } from "zod";

import { AlarmChannelType, AlarmPrincipalType } from "../alarms/types";

export type TAlarmChannelRecipient = {
  principalType: AlarmPrincipalType;
  principalId: string;
};

export type TAlarmChannel = {
  id: string;
  name: string;
  channelType: AlarmChannelType;
  directed: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  recipients: TAlarmChannelRecipient[];
  usageCount: number;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TListAlarmChannelsDTO = {
  projectId?: string;
};

export type TCreateAlarmChannelDTO = {
  name: string;
  channelType: AlarmChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TAlarmChannelRecipient[];
  projectId?: string | null;
};

export type TUpdateAlarmChannelDTO = {
  channelId: string;
  // Carried only for cache invalidation; not sent to the API.
  projectId?: string | null;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TAlarmChannelRecipient[];
};

export type TDeleteAlarmChannelDTO = {
  channelId: string;
  projectId?: string | null;
};

// A recipient chosen in the channel form. `label` is display-only (not sent to the API).
export const alarmChannelRecipientFormSchema = z.object({
  principalType: z.nativeEnum(AlarmPrincipalType),
  principalId: z.string().min(1),
  label: z.string().optional()
});

export type TAlarmChannelRecipientForm = z.infer<typeof alarmChannelRecipientFormSchema>;

// The channel form flattens per-type config into named fields; a superRefine enforces the
// per-type required fields. On edit, required secrets may be left blank to keep the existing value.
export const buildChannelFormSchema = (isEditing: boolean) =>
  z
    .object({
      name: z.string().min(1, "Name is required").max(255),
      channelType: z.nativeEnum(AlarmChannelType),
      enabled: z.boolean().default(true),
      // slack
      webhookUrl: z.string().optional(),
      // webhook
      url: z.string().optional(),
      signingSecret: z.string().optional(),
      // pagerduty
      integrationKey: z.string().optional(),
      // email
      recipients: z.array(alarmChannelRecipientFormSchema).optional()
    })
    .superRefine((data, ctx) => {
      if (data.channelType === AlarmChannelType.Slack && !isEditing && !data.webhookUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["webhookUrl"],
          message: "Slack webhook URL is required"
        });
      }
      if (data.channelType === AlarmChannelType.Slack && data.webhookUrl) {
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
      if (data.channelType === AlarmChannelType.Webhook) {
        if (!data.url || !data.url.startsWith("https://")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["url"],
            message: "Webhook URL must be a valid HTTPS URL"
          });
        }
      }
      if (data.channelType === AlarmChannelType.PagerDuty) {
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
        data.channelType === AlarmChannelType.Email &&
        (!data.recipients || data.recipients.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients"],
          message: "At least one recipient is required"
        });
      }
    });

export type TAlarmChannelForm = z.infer<ReturnType<typeof buildChannelFormSchema>>;
