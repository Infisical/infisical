import { TTenantConsentOutcome } from "../../services/dependencies";

// Thrown inside the client to unwind a token exchange Entra refused for lack of admin consent.
export class ConsentRequiredError extends Error {}

export const checkTenantOfTokens = (
  tenantId: string,
  tokens: { applicationTenantId: string; authorizationTenantId: string }
): TTenantConsentOutcome => {
  if (tokens.applicationTenantId !== tenantId) {
    return {
      verified: false,
      reason: "tenant-mismatch",
      token: "application",
      issuedByTenantId: tokens.applicationTenantId
    };
  }
  if (tokens.authorizationTenantId !== tenantId) {
    return {
      verified: false,
      reason: "tenant-mismatch",
      token: "authorization",
      issuedByTenantId: tokens.authorizationTenantId
    };
  }
  return { verified: true };
};
