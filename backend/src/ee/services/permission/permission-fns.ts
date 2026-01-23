/* eslint-disable no-nested-ternary */
import { ForbiddenError, MongoAbility, PureAbility, subject } from "@casl/ability";
import { z } from "zod";

import { TOrganizations } from "@app/db/schemas/organizations";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

import { OrgPermissionSet } from "./org-permission";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  ProjectPermissionV2Schema,
  SecretSubjectFields
} from "./project-permission";

export function throwIfMissingSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.ReadValue | ProjectPermissionSecretActions.DescribeSecret
  >,
  subjectFields?: SecretSubjectFields
) {
  try {
    if (subjectFields) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.DescribeAndReadValue,
        subject(ProjectPermissionSub.Secrets, subjectFields)
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.DescribeAndReadValue,
        ProjectPermissionSub.Secrets
      );
    }
  } catch {
    if (subjectFields) {
      ForbiddenError.from(permission).throwUnlessCan(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    } else {
      ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Secrets);
    }
  }
}

export function hasSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet>,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue
  >,
  subjectFields?: SecretSubjectFields
) {
  let canNewPermission = false;
  let canOldPermission = false;

  if (subjectFields) {
    canNewPermission = permission.can(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
  } else {
    canNewPermission = permission.can(action, ProjectPermissionSub.Secrets);
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSub.Secrets
    );
  }

  return canNewPermission || canOldPermission;
}

const OptionalArrayPermissionSchema = ProjectPermissionV2Schema.array().optional();
export function checkForInvalidPermissionCombination(permissions: z.infer<typeof OptionalArrayPermissionSchema>) {
  if (!permissions) return;

  for (const permission of permissions) {
    if (permission.subject === ProjectPermissionSub.Secrets) {
      if (permission.action.includes(ProjectPermissionSecretActions.DescribeAndReadValue)) {
        const hasReadValue = permission.action.includes(ProjectPermissionSecretActions.ReadValue);
        const hasDescribeSecret = permission.action.includes(ProjectPermissionSecretActions.DescribeSecret);

        // eslint-disable-next-line no-continue
        if (!hasReadValue && !hasDescribeSecret) continue;

        const hasBothDescribeAndReadValue = hasReadValue && hasDescribeSecret;

        throw new BadRequestError({
          message: `You have selected Read, and ${
            hasBothDescribeAndReadValue
              ? "both Read Value and Describe Secret"
              : hasReadValue
                ? "Read Value"
                : hasDescribeSecret
                  ? "Describe Secret"
                  : ""
          }. You cannot select Read Value or Describe Secret if you have selected Read. The Read permission is a legacy action which has been replaced by Describe Secret and Read Value.`
        });
      }
    }
  }

  return true;
}

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

function validateOrgSSO(
  actorAuthMethod: ActorAuthMethod,
  isOrgSsoEnforced: TOrganizations["authEnforced"],
  isOrgGoogleSsoEnforced: TOrganizations["googleSsoAuthEnforced"],
  isOrgSsoBypassEnabled: TOrganizations["bypassOrgAuthEnabled"],
  isAdmin: boolean
) {
  if (actorAuthMethod === undefined) {
    throw new UnauthorizedError({ name: "No auth method defined" });
  }

  if ((isOrgSsoEnforced || isOrgGoogleSsoEnforced) && isOrgSsoBypassEnabled && isAdmin) {
    return;
  }

  // case: google sso is enforced, but the actor is not using google sso
  if (isOrgGoogleSsoEnforced && actorAuthMethod !== null && actorAuthMethod !== AuthMethod.GOOGLE) {
    throw new ForbiddenRequestError({ name: "Org auth enforced. Cannot access org-scoped resource" });
  }

  // case: SAML SSO is enforced, but the actor is not using SAML SSO
  if (
    isOrgSsoEnforced &&
    actorAuthMethod !== null &&
    !isAuthMethodSaml(actorAuthMethod) &&
    actorAuthMethod !== AuthMethod.OIDC
  ) {
    throw new ForbiddenRequestError({ name: "Org auth enforced. Cannot access org-scoped resource" });
  }
}

const escapeHandlebarsMissingDict = (obj: Record<string, string>, key: string) => {
  const handler = {
    get(target: Record<string, string>, prop: string) {
      if (!Object.hasOwn(target, prop)) {
        // eslint-disable-next-line no-param-reassign
        target[prop] = `{{${key}.${prop}}}`; // Add missing key as an "own" property
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
  shouldUseNewPrivilegeSystem: boolean,
  opAction: OrgPermissionSet[0] | ProjectPermissionSet[0],
  opSubject: OrgPermissionSet[1] | ProjectPermissionSet[1],
  actorPermission: MongoAbility,
  managedPermission: MongoAbility
) => {
  if (shouldUseNewPrivilegeSystem) {
    if (actorPermission.can(opAction, opSubject)) {
      return {
        isValid: true,
        missingPermissions: []
      };
    }

    return {
      isValid: false,
      missingPermissions: [
        {
          action: opAction,
          subject: opSubject
        }
      ]
    };
  }

  // if not, we check if the actor is indeed more privileged than the managed permission - this is the old system
  return validatePermissionBoundary(actorPermission, managedPermission);
};

const constructPermissionErrorMessage = (
  baseMessage: string,
  shouldUseNewPrivilegeSystem: boolean,
  opAction: OrgPermissionSet[0] | ProjectPermissionSet[0],
  opSubject: OrgPermissionSet[1] | ProjectPermissionSet[1]
) => {
  return `${baseMessage}${
    shouldUseNewPrivilegeSystem
      ? `. Actor is missing permission ${opAction as string} on ${opSubject as string}`
      : ". Actor privilege level is not high enough to perform this action"
  }`;
};

export {
  constructPermissionErrorMessage,
  escapeHandlebarsMissingDict,
  isAuthMethodSaml,
  validateOrgSSO,
  validatePrivilegeChangeOperation
};
