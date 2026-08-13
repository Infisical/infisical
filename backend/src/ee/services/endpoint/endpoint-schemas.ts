import net from "node:net";

import { z } from "zod";

import {
  EndpointCountersSchema,
  EndpointDevicesSchema,
  EndpointEventsSchema,
  EndpointNetworkRulesSchema,
  EndpointTargetsSchema
} from "@app/db/schemas";
import { isValidCidr, isValidIp } from "@app/lib/ip";

import {
  EndpointCommandStatus,
  EndpointDestinationKind,
  EndpointDeviceAppSource,
  EndpointDeviceStatus,
  EndpointEventType,
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType,
  EndpointTargetKind
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

// A private-access target is reached by claiming its address on the device itself, so the two kinds
// are validated against what the agent can actually claim: a hostname it can put in /etc/hosts, or a
// single IPv4 address it can alias onto the loopback interface.
export const assertTargetMatchesKind = (
  { kind, destination, ip }: { kind: EndpointTargetKind; destination: string; ip?: string | null },
  ctx: z.RefinementCtx
) => {
  if (kind === EndpointTargetKind.Ip) {
    if (!net.isIPv4(destination)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message: `'${destination}' is not an IPv4 address. An IP target is reached by claiming that exact address on the device, which only works for IPv4 today — for a hostname, use the 'domain' kind.`
      });
      return;
    }

    // The device already uses 127.0.0.0/8 for its own loopback, including the addresses the agent
    // hands out to domain targets. Claiming one as a target would collide with the machine itself.
    if (destination.startsWith("127.")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message: `'${destination}' is a loopback address, which already belongs to the device itself. Name the private address the service actually listens on.`
      });
    }

    if (ip && ip !== destination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ip"],
        message:
          "An IP target is already an address, so it takes no separate 'ip'. That field is for a domain target whose name the gateway cannot resolve."
      });
    }
    return;
  }

  if (!HOSTNAME_REGEX.test(destination) || isValidIp(destination)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination"],
      message: `'${destination}' is not a domain name. For an IP address, use the 'ip' kind.`
    });
  }

  if (ip && !net.isIPv4(ip)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ip"],
      message: `'${ip}' is not an IPv4 address. Leave it empty to have the gateway resolve '${destination}' itself.`
    });
  }
};

// gatewayId is nullable in the table so that deleting a gateway does not delete an admin's targets,
// but a target that arrived here without one could never be dialled, so the console always sends it.
export const SanitizedEndpointTargetSchema = EndpointTargetsSchema.extend({
  kind: z.nativeEnum(EndpointTargetKind),
  gatewayName: z.string().nullable().optional(),
  assignments: z.object({ deviceId: z.string().uuid(), deviceName: z.string() }).array()
});

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

// Not the bucket rows: one entry per destination, rolled up over the range the caller asked for.
// Totals and peaks come back through SUM and MAX over a bigint column, so they arrive as strings.
export const SanitizedEndpointTransferSchema = z.object({
  destination: z.string(),
  totalBytesOut: z.coerce.number(),
  // The most sent in any one bucket. bucketSeconds is what makes it a rate the console can label.
  peakBytesOut: z.coerce.number(),
  bucketSeconds: z.number(),
  // How long the device was actually sending, which a first-to-last span cannot say: a device that
  // sent for one minute an hour ago and one minute now has been transferring for two, not sixty.
  activeSeconds: z.number(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  blocked: z.boolean()
});

// Selected by hand rather than derived from the table: the row's id is what a reader identifies an
// app by, and its createdAt/updatedAt describe the row rather than the installation.
export const SanitizedEndpointDeviceAppSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bundleId: z.string().nullable(),
  version: z.string().nullable(),
  path: z.string(),
  source: z.nativeEnum(EndpointDeviceAppSource),
  // True as of lastSeenAt, not now. The console shows the inventory time beside it so this is never
  // read as a live signal.
  isRunning: z.boolean(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date()
});

export const SanitizedEndpointEventSchema = EndpointEventsSchema.omit({ detail: true }).extend({
  eventType: z.nativeEnum(EndpointEventType),
  detail: z.record(z.unknown()).nullable().optional(),
  deviceName: z.string()
});

// Hand-built rather than derived from the table: the row carries requestedByUserId, and who ran a
// command is answered by the email beside it without handing every reader an internal user id.
export const SanitizedEndpointCommandSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  deviceName: z.string().optional(),
  status: z.nativeEnum(EndpointCommandStatus),
  shell: z.boolean(),
  command: z.string(),
  args: z.string().array(),
  timeoutSeconds: z.number(),
  expiresAt: z.date(),
  requestedByEmail: z.string().nullable(),
  reason: z.string().nullable(),
  dispatchedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  exitCode: z.number().nullable(),
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  outputTruncated: z.boolean(),
  error: z.string().nullable(),
  createdAt: z.date()
});
