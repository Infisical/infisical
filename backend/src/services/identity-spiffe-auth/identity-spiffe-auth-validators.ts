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

export const validateTrustDomain = z
  .string()
  .trim()
  .min(1, "Trust domain is required")
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/, "Invalid trust domain format");
