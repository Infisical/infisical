import { ForbiddenError, MongoAbility, RawRule } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, PermissionBoundaryError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAdditionalPrivilegesScopeFactory } from "../additional-privilege-types";

type TPermissionRule = RawRule & {
  subject?: string | string[];
  action?: string | string[];
};

type TProjectAdditionalPrivilegesScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
};

export const newProjectAdditionalPrivilegesFactory = ({
  permissionService,
  orgDAL,
  membershipDAL,
  userDAL,
  identityDAL
}: TProjectAdditionalPrivilegesScopeFactoryDep): TAdditionalPrivilegesScopeFactory => {
  const $getPermission = (permission: OrgServiceActor, projectId: string) => {
    return permissionService.getProjectPermission({
      actor: permission.type,
      actorId: permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: permission.authMethod,
      projectId,
      actorOrgId: permission.orgId
    });
  };

  const getScopeField: TAdditionalPrivilegesScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  type ConditionCheckType = "unrestricted" | "hasSubjectOrAction" | "hasAction";

  const checkPermissionConditions = (
    actorPermission: MongoAbility,
    permissionAction: string,
    permissionSubject: string,
    checkType: ConditionCheckType
  ): boolean => {
    const actionMatches = (ruleAction: unknown): boolean => {
      if (Array.isArray(ruleAction)) {
        return ruleAction.some((a) => a === permissionAction);
      }
      return ruleAction === permissionAction;
    };

    const subjectMatches = (ruleSubject: unknown): boolean => {
      if (Array.isArray(ruleSubject)) {
        return ruleSubject.some((s) => s === permissionSubject);
      }
      return ruleSubject === permissionSubject;
    };

    const conditionCheck = (conditions: unknown): boolean => {
      switch (checkType) {
        case "unrestricted":
          return !conditions || Object.keys(conditions as object).length === 0;
        case "hasSubjectOrAction":
          return (
            Boolean(conditions) &&
            ("assignableSubject" in (conditions as object) || "assignableAction" in (conditions as object))
          );
        case "hasAction":
          return Boolean(conditions) && "assignableAction" in (conditions as object);
        default:
          return false;
      }
    };

    return actorPermission.rules.some(
      (rule) =>
        !rule.inverted && actionMatches(rule.action) && subjectMatches(rule.subject) && conditionCheck(rule.conditions)
    );
  };

  type PrivilegeValidationAction =
    | typeof ProjectPermissionMemberActions.GrantPrivileges
    | typeof ProjectPermissionMemberActions.AssignAdditionalPrivileges
    | typeof ProjectPermissionIdentityActions.GrantPrivileges
    | typeof ProjectPermissionIdentityActions.AssignAdditionalPrivileges;

  type PrivilegeValidationSubject = ProjectPermissionSub.Member | ProjectPermissionSub.Identity;

  const getActionsToTryForPrivilegeValidation = (
    permissionAction: PrivilegeValidationAction,
    permissionSubject: PrivilegeValidationSubject
  ): ProjectPermissionSet[0][] => {
    const isAssignAdditionalPrivileges =
      permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges ||
      permissionAction === ProjectPermissionIdentityActions.AssignAdditionalPrivileges;

    if (!isAssignAdditionalPrivileges) {
      return [permissionAction];
    }

    const legacyGrantPrivileges =
      permissionSubject === ProjectPermissionSub.Member
        ? ProjectPermissionMemberActions.GrantPrivileges
        : ProjectPermissionIdentityActions.GrantPrivileges;

    return [permissionAction, legacyGrantPrivileges];
  };

  const hasUnrestrictedGrantPrivileges = (
    actorPermission: MongoAbility,
    permissionAction: string,
    permissionSubject: string
  ): boolean => {
    const hasUnconditionalAllowRule = checkPermissionConditions(
      actorPermission,
      permissionAction,
      permissionSubject,
      "unrestricted"
    );
    if (!hasUnconditionalAllowRule) {
      return false;
    }
    // This ensures that cannot rules take precedence over can rules.
    return actorPermission.can(permissionAction, permissionSubject);
  };

  const hasSubjectOrActionConditions = (
    actorPermission: MongoAbility,
    permissionAction: string,
    permissionSubject: string
  ): boolean => checkPermissionConditions(actorPermission, permissionAction, permissionSubject, "hasSubjectOrAction");

  const hasActionConditions = (
    actorPermission: MongoAbility,
    permissionAction: string,
    permissionSubject: string
  ): boolean => checkPermissionConditions(actorPermission, permissionAction, permissionSubject, "hasAction");

  const validateGrantPrivilegeSubjectActionConditions = (
    shouldUseNewPrivilegeSystem: boolean,
    permissionAction:
      | typeof ProjectPermissionMemberActions.GrantPrivileges
      | typeof ProjectPermissionMemberActions.AssignAdditionalPrivileges
      | typeof ProjectPermissionIdentityActions.GrantPrivileges
      | typeof ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
    permissionSubject: ProjectPermissionSub.Member | ProjectPermissionSub.Identity,
    actorPermission: MongoAbility,
    targetUserPermission: MongoAbility,
    targetIdentifier: string | undefined,
    permissions: unknown
  ) => {
    if (hasUnrestrictedGrantPrivileges(actorPermission, permissionAction, permissionSubject)) {
      return;
    }

    // Also check legacy action if new action is being used
    if (
      (permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges &&
        hasUnrestrictedGrantPrivileges(
          actorPermission,
          ProjectPermissionMemberActions.GrantPrivileges,
          permissionSubject
        )) ||
      (permissionAction === ProjectPermissionIdentityActions.AssignAdditionalPrivileges &&
        hasUnrestrictedGrantPrivileges(
          actorPermission,
          ProjectPermissionIdentityActions.GrantPrivileges,
          permissionSubject
        ))
    ) {
      return;
    }

    const permissionRules = permissions as TPermissionRule[];
    const validatedSubjects = new Set<string>();
    const validatedSubjectActions = new Set<string>();

    // Check if the actor has action conditions - if so, skip subject-only validation
    const actorHasActionConditions =
      hasActionConditions(actorPermission, permissionAction, permissionSubject) ||
      (permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges &&
        hasActionConditions(actorPermission, ProjectPermissionMemberActions.GrantPrivileges, permissionSubject)) ||
      (permissionAction === ProjectPermissionIdentityActions.AssignAdditionalPrivileges &&
        hasActionConditions(actorPermission, ProjectPermissionIdentityActions.GrantPrivileges, permissionSubject));

    for (const rule of permissionRules) {
      let ruleSubjects: string[];
      if (Array.isArray(rule.subject)) {
        ruleSubjects = rule.subject as string[];
      } else if (rule.subject) {
        ruleSubjects = [rule.subject as string];
      } else {
        ruleSubjects = [];
      }
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action].filter(Boolean);

      for (const ruleSubject of ruleSubjects) {
        if (!actorHasActionConditions && !validatedSubjects.has(ruleSubject)) {
          const subjectFields =
            permissionSubject === ProjectPermissionSub.Member
              ? { userEmail: targetIdentifier, assignableSubject: ruleSubject }
              : { identityId: targetIdentifier, assignableSubject: ruleSubject };

          const actionsToTry = getActionsToTryForPrivilegeValidation(permissionAction, permissionSubject);

          const subjectBoundary = validatePrivilegeChangeOperation(
            shouldUseNewPrivilegeSystem,
            actionsToTry,
            permissionSubject,
            actorPermission,
            targetUserPermission,
            subjectFields
          );

          if (!subjectBoundary.isValid)
            throw new PermissionBoundaryError({
              message: `You do not have permission to grant privileges on "${ruleSubject}" subject`,
              details: { missingPermissions: subjectBoundary.missingPermissions }
            });
          validatedSubjects.add(ruleSubject);
        }

        for (const actionItem of actions) {
          const subjectActionKey = `${ruleSubject}:${actionItem}`;

          if (!validatedSubjectActions.has(subjectActionKey)) {
            const subjectActionFields =
              permissionSubject === ProjectPermissionSub.Member
                ? { userEmail: targetIdentifier, assignableSubject: ruleSubject, assignableAction: subjectActionKey }
                : { identityId: targetIdentifier, assignableSubject: ruleSubject, assignableAction: subjectActionKey };

            const actionsToTry = getActionsToTryForPrivilegeValidation(permissionAction, permissionSubject);

            const subjectActionBoundary = validatePrivilegeChangeOperation(
              shouldUseNewPrivilegeSystem,
              actionsToTry,
              permissionSubject,
              actorPermission,
              targetUserPermission,
              subjectActionFields
            );

            if (!subjectActionBoundary.isValid)
              throw new PermissionBoundaryError({
                message: `You do not have permission to grant "${actionItem}" action on "${ruleSubject}" subject`,
                details: { missingPermissions: subjectActionBoundary.missingPermissions }
              });
            validatedSubjectActions.add(subjectActionKey);
          }
        }
      }
    }
  };

  const $validateAdditionalPrivilegesGuard = async (params: {
    actorType: ActorType;
    actorId: string;
    permissions: unknown;
    permission: MongoAbility;
    targetUserPermission: MongoAbility;
    memberships: Array<{ actorUserId?: string | null; actorIdentityId?: string | null }>;
    shouldUseNewPrivilegeSystem: boolean;
    targetIdentifier: string | undefined;
    errorMessage: string;
  }) => {
    const {
      actorType,
      actorId,
      permissions,
      permission,
      targetUserPermission,
      memberships,
      shouldUseNewPrivilegeSystem,
      targetIdentifier,
      errorMessage
    } = params;

    const permissionAction =
      actorType === ActorType.USER
        ? ProjectPermissionMemberActions.AssignAdditionalPrivileges
        : ProjectPermissionIdentityActions.AssignAdditionalPrivileges;
    const permissionSubject =
      actorType === ActorType.USER ? ProjectPermissionSub.Member : ProjectPermissionSub.Identity;

    const hasDetailedConditions =
      shouldUseNewPrivilegeSystem &&
      (hasSubjectOrActionConditions(permission, permissionAction, permissionSubject) ||
        (actorType === ActorType.USER &&
          hasSubjectOrActionConditions(
            permission,
            ProjectPermissionMemberActions.GrantPrivileges,
            permissionSubject
          )) ||
        (actorType === ActorType.IDENTITY &&
          hasSubjectOrActionConditions(
            permission,
            ProjectPermissionIdentityActions.GrantPrivileges,
            permissionSubject
          )));

    const subjectFields =
      actorType === ActorType.USER ? { userEmail: targetIdentifier } : { identityId: targetIdentifier };

    if (!hasDetailedConditions) {
      const legacyAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.GrantPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;

      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        [permissionAction, legacyAction],
        permissionSubject,
        permission,
        targetUserPermission,
        subjectFields
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            errorMessage,
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    } else {
      // This prevents bypassing authorization by providing an empty permissions payload.
      const canPerformNewAction = permission.can(permissionAction, permissionSubject);

      const legacyAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.GrantPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;
      const canPerformLegacyAction = permission.can(legacyAction, permissionSubject);

      if (!canPerformNewAction && !canPerformLegacyAction) {
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            errorMessage,
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: {
            missingPermissions: [
              {
                action: permissionAction,
                subject: permissionSubject
              }
            ]
          }
        });
      }
    }

    if (shouldUseNewPrivilegeSystem && permissions) {
      validateGrantPrivilegeSubjectActionConditions(
        shouldUseNewPrivilegeSystem,
        permissionAction,
        permissionSubject,
        permission,
        targetUserPermission,
        targetIdentifier,
        permissions
      );
    }

    const membership = memberships.find(
      (el) => el[actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"] === actorId
    );
    if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
  };

  const onCreateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onCreateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { actorType, actorId } = dto.data;

      const { permission } = await $getPermission(dto.permission, scope.value);
      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity] as const);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: actorId },
        scope.value
      );

      let targetIdentifier: string | undefined;
      if (shouldUseNewPrivilegeSystem) {
        if (actorType === ActorType.USER) {
          const targetUser = await userDAL.findById(actorId);
          targetIdentifier = targetUser?.email ?? undefined;
        } else {
          targetIdentifier = actorId;
        }
      }

      await $validateAdditionalPrivilegesGuard({
        actorType,
        actorId,
        permissions: dto.data.permissions,
        permission,
        targetUserPermission,
        memberships,
        shouldUseNewPrivilegeSystem,
        targetIdentifier,
        errorMessage: "Failed to create additional privileges"
      });
    };

  const onUpdateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onUpdateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { actorType, actorId } = dto.selector;

      const { permission } = await $getPermission(dto.permission, scope.value);
      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity] as const);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: actorId },
        scope.value
      );

      let targetIdentifier: string | undefined;
      if (shouldUseNewPrivilegeSystem) {
        if (actorType === ActorType.USER) {
          const targetUser = await userDAL.findById(actorId);
          targetIdentifier = targetUser?.email ?? undefined;
        } else {
          targetIdentifier = actorId;
        }
      }

      await $validateAdditionalPrivilegesGuard({
        actorType,
        actorId,
        permissions: dto.data.permissions,
        permission,
        targetUserPermission,
        memberships,
        shouldUseNewPrivilegeSystem,
        targetIdentifier,
        errorMessage: "Failed to update additional privileges"
      });
    };

  const onDeleteAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onDeleteAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { actorType } = dto.selector;

      const { permission } = await $getPermission(dto.permission, scope.value);
      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity] as const);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const membership = await membershipDAL.findOne({
        scopeOrgId: dto.permission.orgId,
        scopeProjectId: scope.value,
        [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
      });

      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
    };

  const onListAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onListAdditionalPrivilegesGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { actorType } = dto.selector;

    const permissionSet =
      actorType === ActorType.USER
        ? ([ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member] as const)
        : ([ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity] as const);
    const { permission } = await $getPermission(dto.permission, scope.value);
    ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

    const membership = await membershipDAL.findOne({
      scopeOrgId: dto.permission.orgId,
      scopeProjectId: scope.value,
      [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
    });

    if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
  };

  const onGetAdditionalPrivilegesByIdGuard: TAdditionalPrivilegesScopeFactory["onGetAdditionalPrivilegesByIdGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { actorType } = dto.selector;

      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity] as const);
      const { permission } = await $getPermission(dto.permission, scope.value);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const membership = await membershipDAL.findOne({
        scopeOrgId: dto.permission.orgId,
        scopeProjectId: scope.value,
        [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
      });

      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
    };

  return {
    onCreateAdditionalPrivilegesGuard,
    onUpdateAdditionalPrivilegesGuard,
    onDeleteAdditionalPrivilegesGuard,
    onListAdditionalPrivilegesGuard,
    onGetAdditionalPrivilegesByIdGuard,
    getScopeField
  };
};
