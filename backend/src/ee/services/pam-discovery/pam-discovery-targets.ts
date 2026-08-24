import net from "node:net";

import { Netmask } from "netmask";
import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { isValidIpOrCidr } from "@app/lib/ip";

export const MAX_TARGET_HOSTS = 65536;

const HOSTNAME_REGEX = new RE2(
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
);

const isValidIpv4Target = (value: string) => {
  const base = value.includes("/") ? value.split("/")[0] : value;
  return net.isIPv4(base) && isValidIpOrCidr(value);
};

const isValidTarget = (value: string) =>
  isValidIpv4Target(value) || (value.length <= 253 && HOSTNAME_REGEX.test(value));

// expands cidr ranges / bare ips / hostnames into the deduped set of target hosts. Enforces IPv4-only CIDRs and the host cap
export const expandTargets = (cidrRanges: string[]): string[] => {
  const hosts = new Set<string>();
  for (const range of cidrRanges) {
    const trimmed = range.trim();
    if (trimmed) {
      if (trimmed.includes("/")) {
        if (!net.isIPv4(trimmed.split("/")[0])) {
          throw new BadRequestError({ message: `Only IPv4 CIDR ranges are supported: ${trimmed}` });
        }
        const block = new Netmask(trimmed);
        if (hosts.size + block.size > MAX_TARGET_HOSTS) {
          throw new BadRequestError({ message: `Targets expand to more than ${MAX_TARGET_HOSTS} hosts` });
        }
        block.forEach((ip) => hosts.add(ip));
      } else {
        hosts.add(trimmed);
        if (hosts.size > MAX_TARGET_HOSTS) {
          throw new BadRequestError({ message: `Targets expand to more than ${MAX_TARGET_HOSTS} hosts` });
        }
      }
    }
  }
  return [...hosts];
};

// shared by every host-range discovery source: validates each entry, then that the set expands within the cap
export const DiscoveryTargetsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(50)
  .refine((ranges) => ranges.every(isValidTarget), {
    message: "Each target must be a valid IPv4 address, IPv4 CIDR range, or hostname"
  })
  .superRefine((ranges, ctx) => {
    try {
      expandTargets(ranges);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "Invalid targets"
      });
    }
  });
