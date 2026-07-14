import RE2 from "re2";
import { z } from "zod";

import { isValidIpOrCidr } from "@app/lib/ip";

const HOSTNAME_REGEX = new RE2(
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
);

const isValidTarget = (value: string) => isValidIpOrCidr(value) || (value.length <= 253 && HOSTNAME_REGEX.test(value));

export const UnixDiscoveryConfigSchema = z.object({
  cidrRanges: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(50)
    .refine((ranges) => ranges.every(isValidTarget), {
      message: "Each target must be a valid IP address, CIDR range, or hostname"
    }),
  credentialAccountIds: z.array(z.string().uuid()).min(1).max(50),
  includeSystemAccounts: z.boolean().default(false)
});
