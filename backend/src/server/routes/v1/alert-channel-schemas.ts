import { z } from "zod";

import { AlertChannelType } from "@app/services/alert/alert-channel-types";
import { AlertPrincipalType, MAX_RECIPIENTS_PER_CHANNEL } from "@app/services/alert/alert-types";

export const ChannelRecipientSchema = z.object({
  principalType: z.nativeEnum(AlertPrincipalType),
  principalId: z.string().min(1)
});

export const CreateChannelInputSchema = z.object({
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});

export const UpdateChannelInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  channelType: z.nativeEnum(AlertChannelType),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  recipients: z.array(ChannelRecipientSchema).max(MAX_RECIPIENTS_PER_CHANNEL).optional()
});
