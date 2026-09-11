import { z } from "zod";

import { formatCommaSeparatedPolicyValues } from "@app/services/identity/identity-auth-policy-values";

export const validateJwtAuthAudiencesField = z
  .string()
  .trim()
  .default("")
  .transform(formatCommaSeparatedPolicyValues);

export const validateJwtBoundClaimsField = z.record(z.string()).transform((data) => {
  const formattedClaims: Record<string, string> = {};
  Object.keys(data).forEach((key) => {
    formattedClaims[key] = formatCommaSeparatedPolicyValues(data[key]);
  });

  return formattedClaims;
});
