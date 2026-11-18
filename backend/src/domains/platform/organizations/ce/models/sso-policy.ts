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

export type TSsoSessionRefusal = {
  name: typeof FOREIGN_SSO_SESSION_ERROR_NAME | typeof SSO_REQUIRED_ERROR_NAME;
  message: string;
};

export type TSsoPolicyRecord = {
  rootOrgId: string;
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
};

export type TSsoSession = {
  // Null for the deprecated API key mode, which carries no sign-in method and is never checked.
  authMethod: AuthMethod | null;
  // The root org whose IdP issued the session; absent on own-credential sessions and on tokens issued before the
  // claim existed, which are taken at their auth method.
  sessionRootOrgId?: string;
};

// A root org's sign-in policy. A sub-org has none of its own: its root's applies.
export class SsoPolicy {
  private constructor(
    private readonly rootOrgId: string,
    private readonly authEnforced: boolean,
    private readonly googleSsoAuthEnforced: boolean,
    private readonly bypassOrgAuthEnabled: boolean
  ) {}

  static restore({ rootOrgId, authEnforced, googleSsoAuthEnforced, bypassOrgAuthEnabled }: TSsoPolicyRecord) {
    return new SsoPolicy(rootOrgId, authEnforced, googleSsoAuthEnforced, bypassOrgAuthEnabled);
  }

  static isSamlMethod(authMethod: AuthMethod | null | undefined): boolean {
    return Boolean(authMethod && SAML_AUTH_METHODS.includes(authMethod));
  }

  // Whether a user the policy refuses may still pass on its own root org roles (the caller checks them).
  get allowsBypass(): boolean {
    return this.bypassOrgAuthEnabled;
  }

  // Why the policy refuses a user session, or null when it allows it. The bypass is not applied here.
  refusalFor({ authMethod, sessionRootOrgId }: TSsoSession): TSsoSessionRefusal | null {
    if (authMethod === null) return null;
    if (this.googleSsoAuthEnforced && authMethod !== AuthMethod.GOOGLE) {
      return {
        name: SSO_REQUIRED_ERROR_NAME,
        message:
          "Organization authentication is enforced. Cannot access org-scoped resource. Login with Google SSO to access this resource."
      };
    }
    if (this.authEnforced && !SsoPolicy.isSamlMethod(authMethod) && authMethod !== AuthMethod.OIDC) {
      return {
        name: SSO_REQUIRED_ERROR_NAME,
        message:
          "Organization authentication is enforced. Cannot access org-scoped resource. Login with SAML SSO to access this resource."
      };
    }
    // A session another org's IdP minted would otherwise satisfy this org's enforcement without its IdP, MFA or
    // deprovisioning ever seeing the login.
    if (this.authEnforced && sessionRootOrgId && sessionRootOrgId !== this.rootOrgId) {
      return {
        name: FOREIGN_SSO_SESSION_ERROR_NAME,
        message:
          "This organization requires its own SSO. Your session was issued by another organization's identity provider; log in again through this organization's SSO."
      };
    }
    return null;
  }
}
