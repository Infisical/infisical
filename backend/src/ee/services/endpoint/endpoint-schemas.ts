import { z } from "zod";

import { EndpointDevicesSchema, EndpointEgressRulesSchema, EndpointEventsSchema } from "@app/db/schemas";
import { isValidCidr, isValidIp } from "@app/lib/ip";

import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEgressRuleAction,
  EndpointEgressRuleType,
  EndpointEventType
} from "./endpoint-enums";

const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/;

export const EndpointDestinationSchema = z.string().trim().min(1).max(253);

// kind and destination only make sense together, so they are validated as a pair rather than a
// loose string that fails later on the device when pf cannot match it.
export const assertDestinationMatchesKind = (
  { kind, destination }: { kind: EndpointDestinationKind; destination: string },
  ctx: z.RefinementCtx
) => {
  const isValid = {
    [EndpointDestinationKind.Ip]: isValidIp,
    [EndpointDestinationKind.Cidr]: isValidCidr,
    // An IP literal matches the hostname shape, so it has to be excluded explicitly or the caller
    // gets no hint that they wanted the 'ip' kind.
    [EndpointDestinationKind.Domain]: (value: string) => HOSTNAME_REGEX.test(value) && !isValidIp(value)
  }[kind];

  if (!isValid(destination)) {
    const expected = {
      [EndpointDestinationKind.Ip]: "an IP address, for example 93.184.216.34",
      [EndpointDestinationKind.Cidr]: "a CIDR block, for example 10.0.0.0/24",
      [EndpointDestinationKind.Domain]:
        "a domain name, for example files.example.com. For an IP address, use the 'ip' kind"
    }[kind];

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: `'${destination}' is not valid for the '${kind}' destination kind. Expected ${expected}.`
    });
  }
};

export const SanitizedEndpointDeviceSchema = EndpointDevicesSchema.omit({ blockedAddresses: true }).extend({
  status: z.nativeEnum(EndpointDeviceStatus),
  blockedAddresses: z.string().array()
});

export const EndpointDeviceOwnerSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string()
});

export const EndpointDeviceWithLivenessSchema = SanitizedEndpointDeviceSchema.extend({
  owner: EndpointDeviceOwnerSchema,
  isOnline: z.boolean()
});

export const SanitizedEndpointEgressRuleSchema = EndpointEgressRulesSchema.extend({
  ruleType: z.nativeEnum(EndpointEgressRuleType),
  kind: z.nativeEnum(EndpointDestinationKind),
  action: z.nativeEnum(EndpointEgressRuleAction).nullable().optional()
});

export const SanitizedEndpointEventSchema = EndpointEventsSchema.omit({ detail: true }).extend({
  eventType: z.nativeEnum(EndpointEventType),
  detail: z.record(z.unknown()).nullable().optional(),
  deviceName: z.string()
});
