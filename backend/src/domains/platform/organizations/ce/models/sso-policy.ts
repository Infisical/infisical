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
  // Null for deprecated API key auth: no sign-in method, never checked.
  authMethod: AuthMethod | null;
  // Root org whose IdP issued the session. Missing for own-credential sessions and for tokens minted before this
  // claim existed (those are judged on authMethod alone).
  sessionRootOrgId?: string;
};

// Root orgs only. Sub-orgs use their root's policy.
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

  // A refused user may still get through on their root org roles (caller checks those).
  get allowsBypass(): boolean {
    return this.bypassOrgAuthEnabled;
  }

  // Null means allowed. Doesn't apply the bypass.
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
    // Otherwise a session from another org's IdP would pass enforcement here without this org's IdP, MFA or
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
