import net from "node:net";

import { Netmask } from "netmask";

import { BadRequestError } from "@app/lib/errors";

export const MAX_TARGET_HOSTS = 65536;

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
