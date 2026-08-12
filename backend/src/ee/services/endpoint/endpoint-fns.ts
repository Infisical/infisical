import { TEndpointDevices, TEndpointEvents, TEndpointNetworkRules } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { ENDPOINT_DEVICE_OFFLINE_AFTER_SECONDS } from "./endpoint-constants";
import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType
} from "./endpoint-enums";

export const encodeEndpointEventCursor = (event: { occurredAt: Date; id: string }) =>
  Buffer.from(`${event.occurredAt.toISOString()}|${event.id}`).toString("base64url");

export const decodeEndpointEventCursor = (cursor: string) => {
  const [occurredAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const parsedOccurredAt = new Date(occurredAt);

  if (!id || Number.isNaN(parsedOccurredAt.getTime())) {
    throw new BadRequestError({
      message: "The 'cursor' value is not a valid page cursor. Omit it to start from the newest events."
    });
  }

  return { occurredAt: parsedOccurredAt, id };
};

// blockedAddresses is a jsonb column, so it comes back as unknown and cannot be trusted to be the
// shape the agent last wrote.
export const toBlockedAddressList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const isEndpointDeviceOnline = (lastSeenAt?: Date | null) =>
  Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() <= ENDPOINT_DEVICE_OFFLINE_AFTER_SECONDS * 1000);

// Knex types these columns as plain strings. Only this module writes them, so narrowing to the
// enums here is what lets the routes document their real value set instead of `string`.
export const toEndpointDeviceResponse = (device: TEndpointDevices) => ({
  ...device,
  status: device.status as EndpointDeviceStatus,
  blockedAddresses: toBlockedAddressList(device.blockedAddresses)
});

// A device belongs to a person, so the console needs something human to render. Falls back through
// full name to username, because email is nullable on users.
export const toEndpointDeviceOwner = (owner: {
  userId: string;
  userEmail?: string | null;
  username: string;
  userFirstName?: string | null;
  userLastName?: string | null;
}) => {
  const fullName = [owner.userFirstName, owner.userLastName].filter(Boolean).join(" ");

  return {
    userId: owner.userId,
    email: owner.userEmail ?? owner.username,
    name: fullName || owner.userEmail || owner.username
  };
};

export const toEndpointNetworkRuleResponse = (rule: TEndpointNetworkRules) => ({
  ...rule,
  ruleType: rule.ruleType as EndpointNetworkRuleType,
  kind: rule.kind as EndpointDestinationKind,
  action: (rule.action ?? null) as EndpointNetworkRuleAction | null
});

export const toEndpointEventResponse = (event: TEndpointEvents & { deviceName: string }) => ({
  ...event,
  eventType: event.eventType as EndpointEventType,
  detail: (event.detail ?? null) as Record<string, unknown> | null
});
