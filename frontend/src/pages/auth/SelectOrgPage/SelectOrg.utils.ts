import { jwtDecode } from "jwt-decode";

import { getAuthToken } from "@app/hooks/api/reactQuery";
import { AuthMethod, SAML_AUTH_METHODS } from "@app/hooks/api/users/types";

type TOrgSsoEnforcement = {
  id: string;
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  orgAuthMethod: string;
};

const SSO_ENFORCEMENT_ERRORS = {
  google: 'This organization requires Google login. Log out, then choose "Continue with Google".',
  oidc: 'This organization requires OIDC login. Log out, then choose "Continue with OIDC" and enter your work email.',
  saml: 'This organization requires SAML login. Log out, then choose "Continue with SAML" and enter your work email.',
  foreignIssuer:
    "This organization requires its own SSO. Your session was issued by another organization's identity provider; log out, then sign in through this organization's SSO."
} as const;

// User-facing error when the org enforces an SSO method the session token wasn't issued by,
// else null. Mirrors the server-side selectOrganization check.
export const getSsoEnforcementError = (org: TOrgSsoEnforcement): string | null => {
  if (!org.authEnforced && !org.googleSsoAuthEnforced) return null;

  const authToken = jwtDecode(getAuthToken()) as {
    authMethod: AuthMethod;
    issuingRootOrgId?: string;
  };

  if (org.googleSsoAuthEnforced && authToken.authMethod !== AuthMethod.GOOGLE) {
    return SSO_ENFORCEMENT_ERRORS.google;
  }
  if (org.orgAuthMethod === AuthMethod.OIDC && authToken.authMethod !== AuthMethod.OIDC) {
    return SSO_ENFORCEMENT_ERRORS.oidc;
  }
  if (
    org.orgAuthMethod === AuthMethod.SAML &&
    !SAML_AUTH_METHODS.includes(authToken.authMethod as (typeof SAML_AUTH_METHODS)[number])
  ) {
    return SSO_ENFORCEMENT_ERRORS.saml;
  }
  // An SSO session another org's IdP issued does not satisfy this org's enforcement. Tokens from
  // before the claim existed carry no issuer and pass on their method, as the server does.
  if (org.authEnforced && authToken.issuingRootOrgId && authToken.issuingRootOrgId !== org.id) {
    return SSO_ENFORCEMENT_ERRORS.foreignIssuer;
  }

  return null;
};
