import { MongoAbility } from "@casl/ability";

import { TOrganizations } from "@app/db/schemas";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";
import { ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

import { OrgPermissionSet } from "./org-permission";
import { ProjectPermissionSet } from "./project-permission";

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

// This function serves as a transition layer between the old and new privilege management system
// the old privilege management system is based on the actor having more privileges than the managed permission
// the new privilege management system is based on the actor having the appropriate permission to perform the privilege change,
// regardless of the actor's privilege level.
const validatePrivilegeChangeOperation = (
  action: OrgPermissionSet[0] | ProjectPermissionSet[0],
  subject: OrgPermissionSet[1] | ProjectPermissionSet[1],
  actorPermission: MongoAbility,
  managedPermission: MongoAbility
) => {
  // first we ensure if the actor has the permission to manage the privilege
  if (actorPermission.can(action, subject)) {
    return {
      isValid: true,
      missingPermissions: []
    };
  }

  // if not, we check if the actor is indeed more privileged than the managed permission - this is the old system
  return validatePermissionBoundary(actorPermission, managedPermission);
};

export { escapeHandlebarsMissingMetadata, isAuthMethodSaml, validateOrgSSO, validatePrivilegeChangeOperation };
