import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TCertificateProfileDefaults } from "../certificate-profile/certificate-profile-types";

export const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "d":
      return num;
    case "h":
      return Math.ceil(num / 24);
    case "m":
      return Math.ceil(num / (24 * 60));
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
};

export const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (profileRenewBeforeDays === undefined) {
    return undefined;
  }

  if (profileRenewBeforeDays >= certificateTtlInDays) {
    // If renewBeforeDays >= TTL, renew 1 day before expiry
    return Math.max(1, certificateTtlInDays - 1);
  }

  return profileRenewBeforeDays;
};

/**
 * Resolves the effective TTL to use for certificate issuance.
 *
 * Priority order:
 * 1. Request TTL (user explicitly passed)
 * 2. Profile's defaults.ttlDays (validates against policy max)
 * 3. Flow-specific default (for ACME, EST, etc.)
 * 4. Error - throws if no TTL source is available
 *
 * @param requestTtl - TTL from the certificate request
 * @param profileDefaultTtlDays - Profile's default TTL in days
 * @param policyMaxValidity - Policy's maximum validity (e.g., "365d", "1y")
 * @param flowDefaultTtl - Default TTL for the enrollment flow (e.g., "47d" for ACME, "90d" for EST)
 * @returns The resolved TTL string
 * @throws BadRequestError if profile default TTL exceeds policy max validity
 * @throws BadRequestError if no TTL source is available (for API flows)
 */
export const resolveEffectiveTtl = ({
  requestTtl,
  profileDefaultTtlDays,
  policyMaxValidity,
  flowDefaultTtl
}: {
  requestTtl?: string;
  profileDefaultTtlDays?: number | null;
  policyMaxValidity?: string | null;
  flowDefaultTtl: string;
}): string => {
  // Priority 1: Request TTL (user explicitly passed)
  if (requestTtl) {
    return requestTtl;
  }

  // Priority 2: Profile's defaults.ttlDays
  if (profileDefaultTtlDays) {
    // Validate against policy's maxValidity (catch config drift)
    if (policyMaxValidity) {
      const profileTtlMs = profileDefaultTtlDays * 24 * 60 * 60 * 1000;
      const policyMaxMs = ms(policyMaxValidity);

      if (profileTtlMs > policyMaxMs) {
        throw new BadRequestError({
          message: `Profile's default TTL (${profileDefaultTtlDays} days) exceeds the policy's maximum validity (${policyMaxValidity}). Please update the profile or policy to fix this configuration mismatch.`
        });
      }
    }
    return `${profileDefaultTtlDays}d`;
  }

  // Priority 3: Flow default (for ACME, EST, etc.)
  if (flowDefaultTtl) {
    return flowDefaultTtl;
  }

  // No TTL source available - throw error for API flows
  throw new BadRequestError({
    message: "Certificate issuance requires a valid TTL"
  });
};

/**
 * Applies profile defaults to certificate request
 * Request values always take precedence over defaults.
 * For keyUsages/extendedKeyUsages/basicConstraints, replace strategy: request array wins entirely if present.
 */
export const applyProfileDefaults = <
  T extends {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    keyAlgorithm?: string;
    signatureAlgorithm?: string;
    keyUsages?: string[];
    extendedKeyUsages?: string[];
    basicConstraints?: { isCA: boolean; pathLength?: number };
  }
>(
  request: T,
  defaults: TCertificateProfileDefaults | null | undefined
): T => {
  if (!defaults) return request;

  // For scalar fields, key-presence distinguishes "omitted" (use default) from "explicitly set/cleared".
  return {
    ...request,
    commonName: "commonName" in request ? request.commonName : defaults.commonName,
    organization: "organization" in request ? request.organization : defaults.organization,
    organizationalUnit: "organizationalUnit" in request ? request.organizationalUnit : defaults.organizationalUnit,
    country: "country" in request ? request.country : defaults.country,
    state: "state" in request ? request.state : defaults.state,
    locality: "locality" in request ? request.locality : defaults.locality,
    keyAlgorithm: "keyAlgorithm" in request ? request.keyAlgorithm : defaults.keyAlgorithm,
    signatureAlgorithm: "signatureAlgorithm" in request ? request.signatureAlgorithm : defaults.signatureAlgorithm,
    keyUsages: request.keyUsages !== undefined ? request.keyUsages : defaults.keyUsages,
    extendedKeyUsages: request.extendedKeyUsages !== undefined ? request.extendedKeyUsages : defaults.extendedKeyUsages,
    basicConstraints: request.basicConstraints !== undefined ? request.basicConstraints : defaults.basicConstraints
  };
};
