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

function validateOrgSAML(actorAuthMethod: ActorAuthMethod, isSamlEnforced: TOrganizations["authEnforced"]) {
  if (actorAuthMethod === undefined) {
    throw new UnauthorizedError({ name: "No auth method defined" });
  }

  if (isSamlEnforced && actorAuthMethod !== null && !isAuthMethodSaml(actorAuthMethod)) {
    throw new ForbiddenRequestError({ name: "SAML auth enforced, cannot access org-scoped resource" });
  }
}

export { isAuthMethodSaml, validateOrgSAML };
