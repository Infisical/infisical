import { z } from "zod";

import { formatCommaSeparatedPolicyValues } from "@app/services/identity/identity-auth-policy-values";

export const formatOidcAudiences = formatCommaSeparatedPolicyValues;

export const validateOidcAuthAudiencesField = z.string().trim().default("").transform(formatOidcAudiences);

// no default so a template attach can tell "caller supplied audiences" apart from
// "field omitted"; the service defaults the custom path to ""
export const validateOidcAuthAudiencesFieldOptional = z.string().trim().transform(formatOidcAudiences).optional();

export const validateOidcBoundClaimsField = z.record(z.string()).transform((data) => {
  const formattedClaims: Record<string, string> = {};
  Object.keys(data).forEach((key) => {
    formattedClaims[key] = formatCommaSeparatedPolicyValues(data[key]);
  });

  return formattedClaims;
});

// fields the linked auth template owns on an identity's OIDC auth; both the attach
// and update routes reject them so the two endpoints cannot drift apart
export const TEMPLATE_MANAGED_OIDC_AUTH_FIELDS = [
  "oidcDiscoveryUrl",
  "boundIssuer",
  "boundAudiences",
  "caCert"
] as const;

export const rejectTemplateManagedOidcFields = (data: Record<string, unknown>, ctx: z.RefinementCtx) => {
  TEMPLATE_MANAGED_OIDC_AUTH_FIELDS.forEach((field) => {
    if (data[field] !== undefined) {
      ctx.addIssue({
        path: [field],
        code: z.ZodIssueCode.custom,
        message: `${field} is managed by the auth template and cannot be provided`
      });
    }
  });
};
