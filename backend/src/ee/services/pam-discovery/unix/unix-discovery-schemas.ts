import net from "node:net";

import RE2 from "re2";
import { z } from "zod";

import { isValidIpOrCidr } from "@app/lib/ip";

import { expandTargets } from "./unix-discovery-fns";

const HOSTNAME_REGEX = new RE2(
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
);

// only IPv4 addresses and IPv4 CIDR ranges are supported
const isValidIpv4Target = (value: string) => {
  const base = value.includes("/") ? value.split("/")[0] : value;
  return net.isIPv4(base) && isValidIpOrCidr(value);
};

const isValidTarget = (value: string) =>
  isValidIpv4Target(value) || (value.length <= 253 && HOSTNAME_REGEX.test(value));

export const UnixDiscoveryConfigSchema = z
  .object({
    cidrRanges: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(50)
      .refine((ranges) => ranges.every(isValidTarget), {
        message: "Each target must be a valid IPv4 address, IPv4 CIDR range, or hostname"
      }),
    credentialAccountIds: z.array(z.string().uuid()).min(1).max(50),
    includeSystemAccounts: z.boolean().default(false)
  })
  .superRefine((config, ctx) => {
    try {
      expandTargets(config.cidrRanges);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cidrRanges"],
        message: err instanceof Error ? err.message : "Invalid targets"
      });
    }
  });
