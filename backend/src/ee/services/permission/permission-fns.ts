import { UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

function isAuthMethodSaml(actorAuthMethod: ActorAuthMethod) {
  if (!actorAuthMethod) return false;

  return [AuthMethod.AZURE_SAML, AuthMethod.OKTA_SAML, AuthMethod.JUMPCLOUD_SAML, AuthMethod.GOOGLE_SAML].includes(
    actorAuthMethod
  );
}

function validateOrgSAML(actorAuthMethod: ActorAuthMethod, isSamlEnforced?: boolean | null) {
  if (actorAuthMethod === undefined) {
    throw new UnauthorizedError({ name: "No auth method defined" });
  }

  if (isSamlEnforced && actorAuthMethod !== null && !isAuthMethodSaml(actorAuthMethod)) {
    throw new UnauthorizedError({ name: "Cannot access org-scoped resource" });
  }
}

export { isAuthMethodSaml, validateOrgSAML };
