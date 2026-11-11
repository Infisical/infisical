/* eslint-disable no-nested-ternary */
import { createMongoAbility, ForbiddenError, MongoAbility, PureAbility, subject } from "@casl/ability";
import { z } from "zod";

import { TOrganizations } from "@app/db/schemas";
import {
  escapeHandlebarsMissingDict,
  handlebarsClient,
  interpolatePermissionRules,
  interpolateStoredIdentityRules,
  isActiveRole
} from "@app/domains/platform/access-control/ce/module";
import { OrgPermissionSet } from "@app/domains/platform/organizations/ce/module";
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
} from "@app/domains/platform/projects/ce/module";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorAuthMethod, ActorType, AuthMethod } from "@app/lib/auth/actor-types";
import { validatePermissionBoundary } from "@app/lib/casl/boundary";
import {
  BadRequestError,
  ForbiddenRequestError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TPermissionDALFactory } from "./permission-dal";
import { TCachedFolderScopedPrivileges } from "./permission-service-types";

export function throwIfMissingSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.ReadValue | ProjectPermissionSecretActions.DescribeSecret
  >,
  subjectFields?: SecretSubjectFields
) {
  const secretSubject = subjectFields
    ? subject(ProjectPermissionSub.Secrets, subjectFields)
    : ProjectPermissionSub.Secrets;
  // ForbiddenError captures a stack trace, so only build one when access is actually denied.
  if (
    permission.can(ProjectPermissionSecretActions.DescribeAndReadValue, secretSubject) ||
    permission.can(action, secretSubject)
  ) {
    return;
  }
  ForbiddenError.from(permission).throwUnlessCan(action, secretSubject);
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

export const OptionalArrayPermissionSchema = ProjectPermissionV2Schema.array().optional();
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
    AuthMethod.KEYCLOAK_SAML,
    AuthMethod.AUTH0_SAML
  ].includes(actorAuthMethod);
}

export const FOREIGN_SSO_SESSION_ERROR_NAME = "ForeignSsoSession";

function validateOrgSSO({
  actorAuthMethod,
  isOrgSsoEnforced,
  isOrgGoogleSsoEnforced,
  isOrgSsoBypassEnabled,
  isAdmin,
  issuingRootOrgId,
  rootOrgId
}: {
  actorAuthMethod: ActorAuthMethod;
  isOrgSsoEnforced: TOrganizations["authEnforced"];
  isOrgGoogleSsoEnforced: TOrganizations["googleSsoAuthEnforced"];
  isOrgSsoBypassEnabled: TOrganizations["bypassOrgAuthEnabled"];
  isAdmin: boolean;
  // Root org whose IdP issued the session, when the session is the request's own; tokens issued
  // before the claim existed carry none and are taken at their auth method.
  issuingRootOrgId?: string;
  rootOrgId: string;
}) {
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

  // A session another org's IdP minted would otherwise satisfy this org's enforcement without its
  // IdP, MFA or deprovisioning ever seeing the login.
  if (isOrgSsoEnforced && actorAuthMethod !== null && issuingRootOrgId && issuingRootOrgId !== rootOrgId) {
    throw new ForbiddenRequestError({
      name: FOREIGN_SSO_SESSION_ERROR_NAME,
      message:
        "This organization requires its own SSO. Your session was issued by another organization's identity provider; log in again through this organization's SSO."
    });
  }
}

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

type TAssertRoleSetBoundaryArg = {
  shouldUseNewPrivilegeSystem: boolean;
  opActions: (OrgPermissionSet[0] | ProjectPermissionSet[0]) | (OrgPermissionSet[0] | ProjectPermissionSet[0])[];
  opSubject: OrgPermissionSet[1] | ProjectPermissionSet[1];
  actorPermission: MongoAbility;
  targetPermissions: { permission: MongoAbility; role?: { slug: string } }[];
  baseMessage: string;
  subjectFields?: Record<string, string | undefined>;
};

// Bounds a privilege change against every role the target holds, not just the first one.
const assertRoleSetBoundary = ({
  shouldUseNewPrivilegeSystem,
  opActions,
  opSubject,
  actorPermission,
  targetPermissions,
  baseMessage,
  subjectFields
}: TAssertRoleSetBoundaryArg) => {
  const primaryAction = Array.isArray(opActions) ? opActions[0] : opActions;

  const targets = targetPermissions.length ? targetPermissions : [{ permission: createMongoAbility([]) }];

  for (const target of targets) {
    const targetSubjectFields = target.role ? { ...subjectFields, assignableRole: target.role.slug } : subjectFields;

    const boundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      opActions,
      opSubject,
      actorPermission,
      target.permission,
      targetSubjectFields
    );

    if (!boundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(baseMessage, shouldUseNewPrivilegeSystem, primaryAction, opSubject),
        details: { missingPermissions: boundary.missingPermissions }
      });
  }
};

// Subjects whose forbid rules on new fine-grained actions must also forbid the
// legacy umbrella action they replaced. Without this expansion, an admin allow
// on the legacy action survives a custom-role forbid on the new actions and
// acts as a backdoor through the helpers/call sites that OR-fallback to it
// (e.g. hasSecretReadValueOrDescribePermission, validatePrivilegeChangeOperation).

export const getFolderPermissionVersionFingerprint = async (
  projectId: string,
  keyStore: Pick<TKeyStoreFactory, "pgGetIntItem">
) => String((await keyStore.pgGetIntItem(KeyStorePrefixes.ProjectFolderPermissionVersion(projectId))) ?? 0);

export const getProjectPermissionFingerprint = async (
  {
    projectId,
    orgId,
    actorId,
    actorType
  }: {
    projectId: string;
    orgId: string;
    actorId: string;
    actorType: ActorType.USER | ActorType.IDENTITY;
  },
  {
    permissionDAL,
    keyStore
  }: {
    permissionDAL: Pick<TPermissionDALFactory, "getPermissionFingerprint">;
    keyStore: Pick<TKeyStoreFactory, "pgGetIntItem">;
  }
): Promise<string> => {
  const [membershipFingerprint, folderVersion] = await Promise.all([
    permissionDAL.getPermissionFingerprint({ projectId, orgId, actorId, actorType }),
    getFolderPermissionVersionFingerprint(projectId, keyStore)
  ]);

  return `${membershipFingerprint}:${folderVersion}`;
};

type TFolderScopedPrivilegeDeps = {
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "findFolderScopedPrivileges">;
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
};

// A grant whose folder no longer exists, or that has no role, grants nothing and is left out.
const $resolveFolderScopedPrivileges = async (
  projectId: string,
  rows: Awaited<ReturnType<TAdditionalPrivilegeDALFactory["findFolderScopedPrivileges"]>>,
  secretFolderDAL: TFolderScopedPrivilegeDeps["secretFolderDAL"]
) => {
  if (!rows.length) return [];

  const foldersWithPath = await secretFolderDAL.findSecretPathByFolderIds(
    projectId,
    rows.map((row) => row.folderId)
  );

  return rows.flatMap((row, idx) => {
    const folder = foldersWithPath[idx];
    if (!folder || !row.role) return [];
    return [
      {
        actorId: row.actorUserId ?? row.actorIdentityId,
        privilege: {
          id: row.id,
          folderId: row.folderId,
          role: row.role,
          environmentSlug: folder.environmentSlug,
          secretPath: folder.path,
          isTemporary: row.isTemporary,
          temporaryAccessEndTime: row.temporaryAccessEndTime
        }
      }
    ];
  });
};

export const fetchFolderScopedPrivileges = async (
  projectId: string,
  actor: ActorType.USER | ActorType.IDENTITY,
  actorId: string,
  { additionalPrivilegeDAL, secretFolderDAL }: TFolderScopedPrivilegeDeps
): Promise<TCachedFolderScopedPrivileges> => {
  const rows = await additionalPrivilegeDAL.findFolderScopedPrivileges({ projectId, actorId, actorType: actor });
  const resolved = await $resolveFolderScopedPrivileges(projectId, rows, secretFolderDAL);
  return { privileges: resolved.map(({ privilege }) => privilege) };
};

// Every user's and identity's folder grants in the project, keyed by the actor's id.
export const fetchProjectFolderScopedPrivileges = async (
  projectId: string,
  { additionalPrivilegeDAL, secretFolderDAL }: TFolderScopedPrivilegeDeps
) => {
  const rows = await additionalPrivilegeDAL.findFolderScopedPrivileges({ projectId });
  const privilegesByActorId = new Map<string, TCachedFolderScopedPrivileges["privileges"]>();
  (await $resolveFolderScopedPrivileges(projectId, rows, secretFolderDAL)).forEach(({ actorId, privilege }) => {
    if (!actorId) return;
    privilegesByActorId.set(actorId, [...(privilegesByActorId.get(actorId) ?? []), privilege]);
  });
  return privilegesByActorId;
};

export { interpolatePermissionRules, interpolateStoredIdentityRules, isActiveRole };
export { expandLegacyForbidActions } from "@app/domains/platform/projects/ce/module";
export {
  buildFolderScopedPrivilegeRules,
  filterOverriddenFolderScopedDenyRules
} from "@app/domains/secrets-manager/secrets/ce/module";

export {
  assertRoleSetBoundary,
  constructPermissionErrorMessage,
  escapeHandlebarsMissingDict,
  handlebarsClient,
  isAuthMethodSaml,
  validateOrgSSO,
  validatePrivilegeChangeOperation
};
