import RE2 from "re2";
import { z } from "zod";

export const validateSpiffeAllowedAudiencesField = z
  .string()
  .trim()
  .min(1, "At least one audience is required")
  .transform((data) => {
    return data
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .join(", ");
  });

export const validateSpiffeAllowedIdsField = z
  .string()
  .trim()
  .min(1, "At least one SPIFFE ID pattern is required")
  .transform((data) => {
    return data
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .join(", ");
  });

const TRUST_DOMAIN_REGEX = new RE2("^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$");

export const validateTrustDomain = z
  .string()
  .trim()
  .min(1, "Trust domain is required")
  .refine((val) => TRUST_DOMAIN_REGEX.test(val), "Invalid trust domain format");
