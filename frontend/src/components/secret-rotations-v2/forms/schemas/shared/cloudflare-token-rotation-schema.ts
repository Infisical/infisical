import { z } from "zod";

import { isValidIpOrCidr } from "@app/helpers/ip";

/** Matches the backend — Cloudflare caps token names at 120 and we append a timestamp. */
export const CLOUDFLARE_TOKEN_NAME_MAX_LENGTH = 100;

export const CloudflareTokenIpRestrictionsSchema = z
  .string()
  .trim()
  .array()
  .optional()
  .refine(
    (ips) => !ips || ips.every(isValidIpOrCidr),
    "Each entry must be a valid IP address or CIDR block"
  );

export const CloudflareTokenNameSchema = z
  .string()
  .trim()
  .min(1, "Token name required")
  .max(CLOUDFLARE_TOKEN_NAME_MAX_LENGTH, "Token name too long");
