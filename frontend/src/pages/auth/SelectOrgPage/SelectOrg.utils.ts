import { jwtDecode } from "jwt-decode";

import { getAuthToken } from "@app/hooks/api/reactQuery";
import { AuthMethod, SAML_AUTH_METHODS } from "@app/hooks/api/users/types";

type TOrgSsoEnforcement = {
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  orgAuthMethod: string;
};

const SSO_ENFORCEMENT_ERRORS = {
  google: 'This organization requires Google login. Log out, then choose "Continue with Google".',
  oidc: 'This organization requires OIDC login. Log out, then choose "Continue with OIDC" and enter your work email.',
  saml: 'This organization requires SAML login. Log out, then choose "Continue with SAML" and enter your work email.'
} as const;

// User-facing error when the org enforces an SSO method the session token wasn't issued by,
// else null. Mirrors the server-side selectOrganization check.
export const getSsoEnforcementError = (org: TOrgSsoEnforcement): string | null => {
  if (!org.authEnforced && !org.googleSsoAuthEnforced) return null;

  const authToken = jwtDecode(getAuthToken()) as { authMethod: AuthMethod };

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

  return null;
};
