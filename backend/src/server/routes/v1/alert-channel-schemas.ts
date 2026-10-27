import { z } from "zod";

import { AlertChannelType } from "@app/services/alert/alert-channel-types";
import { AlertPrincipalType, MAX_RECIPIENTS_PER_CHANNEL } from "@app/services/alert/alert-types";

// Each channel type validates its own fields in the alert module; this only stops an oversized body
// from reaching it.
const MAX_CHANNEL_CONFIG_LENGTH = 8192;
const ChannelConfigSchema = z
  .record(z.unknown())
  .refine((config) => JSON.stringify(config).length <= MAX_CHANNEL_CONFIG_LENGTH, "Channel config is too large");

export const ChannelRecipientSchema = z.object({
  principalType: z.nativeEnum(AlertPrincipalType),
  // A user or group id, or the project's id for project members. Older project ids are not UUIDs.
  principalId: z.string().trim().min(1).max(255)
});

export const CreateChannelInputSchema = z.object({
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: ChannelConfigSchema.default({}),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});

export const UpdateChannelInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: ChannelConfigSchema.optional(),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});
