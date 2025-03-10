/* eslint-disable no-nested-ternary */
import { ForbiddenError, MongoAbility, PureAbility, subject } from "@casl/ability";
import { z } from "zod";

import { TOrganizations } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

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
      ForbiddenError.from(permission).throwUnlessCan(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    } else {
      ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Secrets);
    }
  } catch {
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
