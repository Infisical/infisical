import { z } from "zod";

import { isValidIpOrCidr } from "@app/lib/ip";

import { CLOUDFLARE_TOKEN_NAME_MAX_LENGTH } from "./cloudflare-token-rotation-constants";

export enum CloudflareTokenPolicyEffect {
  Allow = "allow",
  Deny = "deny"
}

export const CloudflareTokenIpRestrictionSchema = z
  .string()
  .trim()
  .refine(isValidIpOrCidr, "Must be a valid IP address or CIDR block");

// Each rotation applies its own `.describe()` so the OpenAPI text stays rotation-specific.
export const CloudflareTokenNameSchema = z
  .string()
  .trim()
  .min(1, "Token name required")
  .max(CLOUDFLARE_TOKEN_NAME_MAX_LENGTH, `Token name must be ${CLOUDFLARE_TOKEN_NAME_MAX_LENGTH} characters or fewer`);
