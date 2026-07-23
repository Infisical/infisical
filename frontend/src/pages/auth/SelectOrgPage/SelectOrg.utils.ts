import { jwtDecode } from "jwt-decode";

import { getAuthToken } from "@app/hooks/api/reactQuery";
import { AuthMethod, SAML_AUTH_METHODS } from "@app/hooks/api/users/types";

type TOrgSsoEnforcement = {
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  orgAuthMethod: string;
};

// User-facing error when the org enforces an SSO method the session token wasn't issued by,
// else null. Mirrors the server-side selectOrganization check.
export const getSsoEnforcementError = (org: TOrgSsoEnforcement): string | null => {
  if (!org.authEnforced && !org.googleSsoAuthEnforced) return null;

  const authToken = jwtDecode(getAuthToken()) as { authMethod: AuthMethod };

  let ssoType = "";
  if (org.googleSsoAuthEnforced && authToken.authMethod !== AuthMethod.GOOGLE) {
    ssoType = "Google SSO";
  } else if (org.orgAuthMethod === AuthMethod.OIDC && authToken.authMethod !== AuthMethod.OIDC) {
    ssoType = "OIDC SSO";
  } else if (
    org.orgAuthMethod === AuthMethod.SAML &&
    !SAML_AUTH_METHODS.includes(authToken.authMethod as (typeof SAML_AUTH_METHODS)[number])
  ) {
    ssoType = "SAML SSO";
  }

  if (!ssoType) return null;
  return `This organization requires ${ssoType}. Please log out and re-login via your identity provider.`;
};
