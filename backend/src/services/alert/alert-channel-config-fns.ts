import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import { AlertChannelType, TAlertChannelDefinition } from "./alert-channel-types";
import { ALERT_CHANNEL_REGISTRY } from "./channels/alert-channel-registry";

export const getChannelDefinition = (channelType: string): TAlertChannelDefinition => {
  const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
  if (!definition) throw new BadRequestError({ message: `Unknown channel type '${channelType}'` });
  return definition;
};

export const assertChannelConfigValid = (
  definition: Pick<TAlertChannelDefinition, "configSchema">,
  channelType: string,
  config: Record<string, unknown>
) => {
  try {
    definition.configSchema.parse(config);
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : null;
    throw new BadRequestError({
      message: detail ? `Invalid ${channelType} channel config: ${detail}` : `Invalid ${channelType} channel config`
    });
  }
};

export const mergeChannelConfigWithStored = (
  channelType: string,
  incomingConfig: Record<string, unknown>,
  existingConfig: Record<string, unknown>
): Record<string, unknown> => {
  const definition = ALERT_CHANNEL_REGISTRY[channelType as AlertChannelType];
  if (!definition) return incomingConfig;

  const merged: Record<string, unknown> = { ...incomingConfig };
  definition.secretFields.forEach((field) => {
    if (!(field in incomingConfig)) {
      if (existingConfig[field] != null) merged[field] = existingConfig[field];
      return;
    }
    const value = incomingConfig[field];
    if (value === "" || value === null || value === undefined) delete merged[field];
  });
  return merged;
};
