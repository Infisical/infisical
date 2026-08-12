import { z } from "zod";

import {
  EndpointCountersSchema,
  EndpointDevicesSchema,
  EndpointEventsSchema,
  EndpointNetworkRulesSchema
} from "@app/db/schemas";
import { isValidCidr, isValidIp } from "@app/lib/ip";

import {
  EndpointDestinationKind,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType
} from "./endpoint-enums";

const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/;

export const EndpointDestinationSchema = z.string().trim().min(1).max(253);

// A rule for "everything" is a trap rather than a broad policy: it blocks loopback and the device's
// own connection to Infisical along with the internet, which leaves nothing able to tell the agent to
// undo it. Blocking every destination is not a thing an admin can usefully ask for here.
const WILDCARD_DESTINATIONS = ["0.0.0.0/0", "::/0"];

// kind and destination only make sense together, so they are validated as a pair rather than a
// loose string that fails later on the device when pf cannot match it.
export const assertDestinationMatchesKind = (
  { kind, destination }: { kind: EndpointDestinationKind; destination: string },
  ctx: z.RefinementCtx
) => {
  if (WILDCARD_DESTINATIONS.includes(destination)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: `'${destination}' matches every destination, which would also block this device's own connection to Infisical. Name the destination you want to block instead.`
    });
    return;
  }

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

// Which fields a rule carries depends on its type, so the two shapes are validated as a pair with
// ruleType rather than as one shape with everything optional.
export const assertNetworkRuleShape = (
  {
    ruleType,
    kind,
    destination
  }: { ruleType: EndpointNetworkRuleType; kind?: EndpointDestinationKind; destination?: string },
  ctx: z.RefinementCtx
) => {
  if (ruleType === EndpointNetworkRuleType.Volume) {
    if (kind || destination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message:
          "A volume rule takes no 'destination' or 'kind': it blocks whichever destination a device sends more than the threshold to, including ones nobody listed. To cap traffic to a destination you already know, create a destination rule."
      });
    }
    return;
  }

  if (!kind || !destination) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: "A destination rule needs a 'destination' and the 'kind' that says how to read it."
    });
    return;
  }

  assertDestinationMatchesKind({ kind, destination }, ctx);
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

// kind and destination are null on a volume rule, which names no destination at all.
export const SanitizedEndpointNetworkRuleSchema = EndpointNetworkRulesSchema.extend({
  ruleType: z.nativeEnum(EndpointNetworkRuleType),
  kind: z.nativeEnum(EndpointDestinationKind).nullable().optional(),
  action: z.nativeEnum(EndpointNetworkRuleAction).nullable().optional()
});

// bytesOut and thresholdBytes are bigint columns, so the generated schema already coerces them from
// the strings pg returns. Extending it keeps that coercion instead of re-declaring them as numbers.
//
// The counter's own destination is the only one there is: it was discovered on the device, not
// configured on the rule.
export const SanitizedEndpointCounterSchema = EndpointCountersSchema.extend({
  deviceName: z.string(),
  ruleName: z.string(),
  ruleWindowSeconds: z.number().nullable().optional()
});

export const SanitizedEndpointEventSchema = EndpointEventsSchema.omit({ detail: true }).extend({
  eventType: z.nativeEnum(EndpointEventType),
  detail: z.record(z.unknown()).nullable().optional(),
  deviceName: z.string()
});
