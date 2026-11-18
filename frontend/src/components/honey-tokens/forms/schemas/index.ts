import { z } from "zod";

import { channelFormSchema, TChannelForm, toChannelInput } from "@app/hooks/api/alerts";

import { AwsHoneyTokenSchema } from "./aws-honey-token-schema";

const TriggerAlertChannelsSchema = z
  .array(channelFormSchema)
  .min(1, "At least one channel is required");

export type TSavedTriggerAlert = {
  enabled: boolean;
  channels: TChannelForm[];
};

export const serializeTriggerAlertChannels = (channels: TChannelForm[]) =>
  JSON.stringify(channels.map(toChannelInput));

// Channels are only checked while the alert is on, so a hidden, half-filled channel can't block
// saving the honey token. A saved alert the user left untouched isn't checked either: recipient
// cleanup can leave it with an empty, disabled channel, and saving the token doesn't send the alert.
const buildTriggerAlertSchema = (savedAlert?: TSavedTriggerAlert) => {
  const savedChannels = savedAlert ? serializeTriggerAlertChannels(savedAlert.channels) : undefined;

  return z
    .object({
      isTriggerAlertEnabled: z.boolean(),
      channels: z.custom<TChannelForm[]>()
    })
    .superRefine(({ isTriggerAlertEnabled, channels }, ctx) => {
      if (!isTriggerAlertEnabled) return;
      if (savedAlert?.enabled && savedChannels === serializeTriggerAlertChannels(channels)) {
        return;
      }

      const result = TriggerAlertChannelsSchema.safeParse(channels);
      if (result.success) return;

      result.error.issues.forEach((issue) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ["channels", ...issue.path]
        });
      });
    });
};

export const HoneyTokenFormSchema = (savedTriggerAlert?: TSavedTriggerAlert) =>
  z.intersection(
    z.discriminatedUnion("type", [AwsHoneyTokenSchema]),
    buildTriggerAlertSchema(savedTriggerAlert)
  );

export type THoneyTokenForm = z.infer<ReturnType<typeof HoneyTokenFormSchema>>;

export { AwsHoneyTokenSchema };
