import type { TActorOrgSsoPolicy } from "@app/domains/lib/actor-context";
import { AuthMethod } from "@app/lib/auth/actor-types";

export const FOREIGN_SSO_SESSION_ERROR_NAME = "ForeignSsoSession";
export const SSO_REQUIRED_ERROR_NAME = "OrgSsoRequired";

const SAML_AUTH_METHODS: AuthMethod[] = [
  AuthMethod.AZURE_SAML,
  AuthMethod.OKTA_SAML,
  AuthMethod.JUMPCLOUD_SAML,
  AuthMethod.GOOGLE_SAML,
  AuthMethod.KEYCLOAK_SAML,
  AuthMethod.AUTH0_SAML
];

export const isAuthMethodSaml = (authMethod: AuthMethod | null | undefined): boolean =>
  Boolean(authMethod && SAML_AUTH_METHODS.includes(authMethod));

export type TSsoSessionRefusal = {
  name: typeof FOREIGN_SSO_SESSION_ERROR_NAME | typeof SSO_REQUIRED_ERROR_NAME;
  message: string;
};

export type TSsoSessionInput = {
  // Null for the deprecated API key mode, which carries no sign-in method and is never checked.
  authMethod: AuthMethod | null;
  // The root org whose IdP issued the session; absent on own-credential sessions and on tokens issued before the
  // claim existed, which are taken at their auth method.
  sessionRootOrgId?: string;
  rootOrgId: string;
  // The root org's policy: a sub-org applies its root's.
  policy: TActorOrgSsoPolicy;
};

// Why the root org's sign-in policy refuses a user session, or undefined when it allows it. The bypass is not
// applied here: it needs the user's root org roles, so the caller asks only when this refuses.
export const ssoSessionRefusal = ({
  authMethod,
  sessionRootOrgId,
  rootOrgId,
  policy
}: TSsoSessionInput): TSsoSessionRefusal | undefined => {
  if (authMethod === null) return undefined;

  if (policy.googleSsoAuthEnforced && authMethod !== AuthMethod.GOOGLE) {
    return {
      name: SSO_REQUIRED_ERROR_NAME,
      message:
        "Organization authentication is enforced. Cannot access org-scoped resource. Login with Google SSO to access this resource."
    };
  }

  if (policy.authEnforced && !isAuthMethodSaml(authMethod) && authMethod !== AuthMethod.OIDC) {
    return {
      name: SSO_REQUIRED_ERROR_NAME,
      message:
        "Organization authentication is enforced. Cannot access org-scoped resource. Login with SAML SSO to access this resource."
    };
  }

  // A session another org's IdP minted would otherwise satisfy this org's enforcement without its IdP, MFA or
  // deprovisioning ever seeing the login.
  if (policy.authEnforced && sessionRootOrgId && sessionRootOrgId !== rootOrgId) {
    return {
      name: FOREIGN_SSO_SESSION_ERROR_NAME,
      message:
        "This organization requires its own SSO. Your session was issued by another organization's identity provider; log in again through this organization's SSO."
    };
  }

  return undefined;
};
