import { TOrganizations } from "@app/db/schemas";
import { ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

function isAuthMethodSaml(actorAuthMethod: ActorAuthMethod) {
  if (!actorAuthMethod) return false;

  return [
    AuthMethod.AZURE_SAML,
    AuthMethod.OKTA_SAML,
    AuthMethod.JUMPCLOUD_SAML,
    AuthMethod.GOOGLE_SAML,
    AuthMethod.KEYCLOAK_SAML
  ].includes(actorAuthMethod);
}

function validateOrgSSO(actorAuthMethod: ActorAuthMethod, isOrgSsoEnforced: TOrganizations["authEnforced"]) {
  if (actorAuthMethod === undefined) {
    throw new UnauthorizedError({ name: "No auth method defined" });
  }

  if (
    isOrgSsoEnforced &&
    actorAuthMethod !== null &&
    !isAuthMethodSaml(actorAuthMethod) &&
    actorAuthMethod !== AuthMethod.OIDC
  ) {
    throw new ForbiddenRequestError({ name: "Org auth enforced. Cannot access org-scoped resource" });
  }
}

const escapeHandlebarsMissingMetadata = (obj: Record<string, string>) => {
  const handler = {
    get(target: Record<string, string>, prop: string) {
      if (!(prop in target)) {
        // eslint-disable-next-line no-param-reassign
        target[prop] = `{{identity.metadata.${prop}}}`; // Add missing key as an "own" property
      }
      return target[prop];
    }
  };

  return new Proxy(obj, handler);
};

export { escapeHandlebarsMissingMetadata, isAuthMethodSaml, validateOrgSSO };
