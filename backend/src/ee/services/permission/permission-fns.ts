/* eslint-disable no-nested-ternary */
import { ForbiddenError, MongoAbility, PureAbility, RawRuleOf, subject } from "@casl/ability";
import handlebars from "handlebars";
import { z } from "zod";

import { TOrganizations } from "@app/db/schemas";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";
import { BadRequestError, ForbiddenRequestError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, AuthMethod } from "@app/services/auth/auth-type";

import { OrgPermissionSet } from "./org-permission";
import {
  ActionAllowedConditions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
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

// Personal secret overrides can be managed either by the dedicated PersonalOverride action or by
// whoever already has the matching shared-secret action (Create/Edit/Delete). This lets a role grant
// personal-override-only access while existing shared-secret writers keep managing overrides.
export function throwIfMissingSecretPersonalOverridePermission(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  fallbackAction: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.Create | ProjectPermissionSecretActions.Edit | ProjectPermissionSecretActions.Delete
  >,
  subjectFields?: SecretSubjectFields
) {
  try {
    if (subjectFields) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.PersonalOverride,
        subject(ProjectPermissionSub.Secrets, subjectFields)
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.PersonalOverride,
        ProjectPermissionSub.Secrets
      );
    }
  } catch {
    if (subjectFields) {
      ForbiddenError.from(permission).throwUnlessCan(
        fallbackAction,
        subject(ProjectPermissionSub.Secrets, subjectFields)
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(fallbackAction, ProjectPermissionSub.Secrets);
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

// authorizes moving secrets from one (environment, path) to another at the path level: a move is a
// delete-at-source + create/edit-at-destination, and the source read also requires read-value/describe.
// this is path-scoped (no per-secret name/tag conditions), so a single call covers a whole batch of
// secrets sharing the same source and destination path. throws ForbiddenError on the first missing grant.
export function validateSecretMovePermissions(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  {
    sourceEnvironment,
    sourceSecretPath,
    destinationEnvironment,
    destinationSecretPath
  }: {
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
  }
) {
  const sourceActions = [
    ProjectPermissionSecretActions.Delete,
    ProjectPermissionSecretActions.DescribeSecret,
    ProjectPermissionSecretActions.ReadValue
  ] as const;
  const destinationActions = [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit] as const;

  for (const destinationAction of destinationActions) {
    ForbiddenError.from(permission).throwUnlessCan(
      destinationAction,
      subject(ProjectPermissionSub.Secrets, {
        environment: destinationEnvironment,
        secretPath: destinationSecretPath
      })
    );
  }

  for (const sourceAction of sourceActions) {
    if (
      sourceAction === ProjectPermissionSecretActions.ReadValue ||
      sourceAction === ProjectPermissionSecretActions.DescribeSecret
    ) {
      throwIfMissingSecretReadValueOrDescribePermission(permission, sourceAction, {
        environment: sourceEnvironment,
        secretPath: sourceSecretPath
      });
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        sourceAction,
        subject(ProjectPermissionSub.Secrets, {
          environment: sourceEnvironment,
          secretPath: sourceSecretPath
        })
      );
    }
  }
}

const OptionalArrayPermissionSchema = ProjectPermissionV2Schema.array().optional();
export function checkForInvalidPermissionCombination(permissions: z.infer<typeof OptionalArrayPermissionSchema>) {
  if (!permissions) return;

  for (const permission of permissions) {
    if (permission.subject === ProjectPermissionSub.Secrets) {
      if (permission.action.includes(ProjectPermissionSecretActions.DescribeAndReadValue)) {
        const hasReadValue = permission.action.includes(ProjectPermissionSecretActions.ReadValue);
        const hasDescribeSecret = permission.action.includes(ProjectPermissionSecretActions.DescribeSecret);

        if (hasReadValue || hasDescribeSecret) {
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

    if (permission.subject === ProjectPermissionSub.Member) {
      if (permission.action.includes(ProjectPermissionMemberActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionMemberActions.AssignRole);
        const hasAssignAdditionalPrivileges = permission.action.includes(
          ProjectPermissionMemberActions.AssignAdditionalPrivileges
        );

        if (hasAssignRole || hasAssignAdditionalPrivileges) {
          const hasBothNewActions = hasAssignRole && hasAssignAdditionalPrivileges;

          throw new BadRequestError({
            message: `You have selected Grant Privileges, and ${
              hasBothNewActions
                ? "both Assign Role and Assign Additional Privileges"
                : hasAssignRole
                  ? "Assign Role"
                  : hasAssignAdditionalPrivileges
                    ? "Assign Additional Privileges"
                    : ""
            }. You cannot select Assign Role or Assign Additional Privileges if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role and Assign Additional Privileges.`
          });
        }
      }
    }

    if (permission.subject === ProjectPermissionSub.Identity) {
      if (permission.action.includes(ProjectPermissionIdentityActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionIdentityActions.AssignRole);
        const hasAssignAdditionalPrivileges = permission.action.includes(
          ProjectPermissionIdentityActions.AssignAdditionalPrivileges
        );

        if (hasAssignRole || hasAssignAdditionalPrivileges) {
          const hasBothNewActions = hasAssignRole && hasAssignAdditionalPrivileges;

          throw new BadRequestError({
            message: `You have selected Grant Privileges, and ${
              hasBothNewActions
                ? "both Assign Role and Assign Additional Privileges"
                : hasAssignRole
                  ? "Assign Role"
                  : hasAssignAdditionalPrivileges
                    ? "Assign Additional Privileges"
                    : ""
            }. You cannot select Assign Role or Assign Additional Privileges if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role and Assign Additional Privileges.`
          });
        }
      }
    }

    if (permission.subject === ProjectPermissionSub.Groups) {
      if (permission.action.includes(ProjectPermissionGroupActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionGroupActions.AssignRole);

        if (hasAssignRole) {
          throw new BadRequestError({
            message:
              "You have selected Grant Privileges and Assign Role. You cannot select Assign Role if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role."
          });
        }
      }
    }

    const subjectConditions = ActionAllowedConditions[permission.subject as ProjectPermissionSub];
    const permissionConditions = "conditions" in permission ? permission.conditions : undefined;
    if (permissionConditions && subjectConditions) {
      const conditionKeys = Object.keys(permissionConditions);
      for (const action of permission.action) {
        const allowedConditions = subjectConditions[action];
        if (allowedConditions) {
          for (const condKey of conditionKeys) {
            if (!allowedConditions.includes(condKey)) {
              throw new BadRequestError({
                message: `Condition "${condKey}" is not allowed for action "${action}" on subject "${permission.subject}"`
              });
            }
          }
        }
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
    throw new ForbiddenRequestError({
      message:
        "Organization authentication is enforced. Cannot access org-scoped resource. Login with Google SSO to access this resource."
    });
  }

  // case: SAML SSO is enforced, but the actor is not using SAML SSO
  if (
    isOrgSsoEnforced &&
    actorAuthMethod !== null &&
    !isAuthMethodSaml(actorAuthMethod) &&
    actorAuthMethod !== AuthMethod.OIDC
  ) {
    throw new ForbiddenRequestError({
      message:
        "Organization authentication is enforced. Cannot access org-scoped resource. Login with SAML SSO to access this resource."
    });
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
  opActions: (OrgPermissionSet[0] | ProjectPermissionSet[0]) | (OrgPermissionSet[0] | ProjectPermissionSet[0])[],
  opSubject: OrgPermissionSet[1] | ProjectPermissionSet[1],
  actorPermission: MongoAbility,
  managedPermission: MongoAbility,
  subjectFields?: Record<string, string | undefined>
) => {
  const actions = Array.isArray(opActions) ? opActions : [opActions];

  if (shouldUseNewPrivilegeSystem) {
    const subjectToCheck = subjectFields ? subject(opSubject as string, subjectFields) : opSubject;

    for (const opAction of actions) {
      if (actorPermission.can(opAction, subjectToCheck)) {
        return {
          isValid: true,
          missingPermissions: []
        };
      }
    }

    // Report the first (primary) action in missingPermissions.
    // For example, when evaluating legacy actions fallback, it returns the error related to the new one not the legacy one.
    return {
      isValid: false,
      missingPermissions: [
        {
          action: actions[0],
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
      ? `. Permission denied: ${opAction as string} on ${opSubject as string}. Check that the actor's role grants this permission and that all permission conditions are met.`
      : ". Actor privilege level is not high enough to perform this action"
  }`;
};

const assertPermissionBoundary = (actorPermission: MongoAbility, managedPermission: MongoAbility, message: string) => {
  const boundary = validatePermissionBoundary(actorPermission, managedPermission);
  if (!boundary.isValid) {
    throw new PermissionBoundaryError({
      message,
      details: { missingPermissions: boundary.missingPermissions }
    });
  }
};

// Subjects whose forbid rules on new fine-grained actions must also forbid the
// legacy umbrella action they replaced. Without this expansion, an admin allow
// on the legacy action survives a custom-role forbid on the new actions and
// acts as a backdoor through the helpers/call sites that OR-fallback to it
// (e.g. hasSecretReadValueOrDescribePermission, validatePrivilegeChangeOperation).
const LEGACY_FORBID_ACTION_EXPANSIONS: Partial<
  Record<ProjectPermissionSub, { legacyAction: string; newActions: string[] }>
> = {
  [ProjectPermissionSub.Secrets]: {
    legacyAction: ProjectPermissionSecretActions.DescribeAndReadValue,
    newActions: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret]
  },
  [ProjectPermissionSub.Member]: {
    legacyAction: ProjectPermissionMemberActions.GrantPrivileges,
    newActions: [ProjectPermissionMemberActions.AssignRole, ProjectPermissionMemberActions.AssignAdditionalPrivileges]
  },
  [ProjectPermissionSub.Identity]: {
    legacyAction: ProjectPermissionIdentityActions.GrantPrivileges,
    newActions: [
      ProjectPermissionIdentityActions.AssignRole,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges
    ]
  },
  [ProjectPermissionSub.Groups]: {
    legacyAction: ProjectPermissionGroupActions.GrantPrivileges,
    newActions: [ProjectPermissionGroupActions.AssignRole]
  }
};

const expandLegacyForbidActions = <T extends RawRuleOf<MongoAbility<ProjectPermissionSet>>>(rules: T[]): T[] => {
  return rules.map((rule) => {
    if (!rule.inverted) return rule;

    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    if (subjects.length !== 1) return rule;

    const expansion = LEGACY_FORBID_ACTION_EXPANSIONS[subjects[0] as ProjectPermissionSub];
    if (!expansion) return rule;

    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const shouldExpand = actions.some((a) => expansion.newActions.includes(a as string));
    if (!shouldExpand || actions.includes(expansion.legacyAction as (typeof actions)[number])) return rule;

    return { ...rule, action: [...actions, expansion.legacyAction] as typeof rule.action };
  });
};

const hbsStripPrefix = (text: string, prefix: string) => {
  const textStr = String(text || "");
  if (!textStr) return textStr;

  return textStr.startsWith(prefix) ? textStr.substring(prefix.length) : textStr;
};

const handlebarsClient = (() => {
  const hbs = handlebars.create();

  hbs.registerHelper("stripPrefix", hbsStripPrefix);

  return hbs;
})();

export {
  assertPermissionBoundary,
  constructPermissionErrorMessage,
  escapeHandlebarsMissingDict,
  expandLegacyForbidActions,
  handlebarsClient,
  isAuthMethodSaml,
  validateOrgSSO,
  validatePrivilegeChangeOperation
};
