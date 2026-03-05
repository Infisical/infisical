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
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, PermissionBoundaryError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
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
};

export const newProjectAdditionalPrivilegesFactory = ({
  permissionService,
  orgDAL,
  membershipDAL,
  userDAL
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

  const hasUnrestrictedGrantPrivileges = (
    actorPermission: MongoAbility,
    permissionAction: string,
    permissionSubject: string
  ): boolean => {
    const actionMatches = (ruleAction: unknown): boolean => {
      if (Array.isArray(ruleAction)) {
        return ruleAction.some((a) => a === permissionAction || a === "manage");
      }
      return ruleAction === permissionAction || ruleAction === "manage";
    };

    const subjectMatches = (ruleSubject: unknown): boolean => {
      if (Array.isArray(ruleSubject)) {
        return ruleSubject.some((s) => s === permissionSubject || s === "all");
      }
      return ruleSubject === permissionSubject || ruleSubject === "all";
    };

    return actorPermission.rules.some(
      (rule) =>
        !rule.inverted &&
        actionMatches(rule.action) &&
        subjectMatches(rule.subject) &&
        (!rule.conditions || Object.keys(rule.conditions).length === 0)
    );
  };

  const validateGrantPrivilegeSubjectActionConditions = (
    shouldUseNewPrivilegeSystem: boolean,
    permissionAction:
      | typeof ProjectPermissionMemberActions.GrantPrivileges
      | typeof ProjectPermissionMemberActions.AssignAdditionalPrivileges
      | typeof ProjectPermissionIdentityActions.GrantPrivileges,
    permissionSubject: ProjectPermissionSub.Member | ProjectPermissionSub.Identity,
    actorPermission: MongoAbility,
    targetUserPermission: MongoAbility,
    targetUserEmail: string | undefined,
    permissions: unknown
  ) => {
    if (hasUnrestrictedGrantPrivileges(actorPermission, permissionAction, permissionSubject)) {
      return;
    }

    // Also check legacy action if new action is being used
    if (
      permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges &&
      hasUnrestrictedGrantPrivileges(actorPermission, ProjectPermissionMemberActions.GrantPrivileges, permissionSubject)
    ) {
      return;
    }

    const permissionRules = permissions as TPermissionRule[];
    const validatedSubjects = new Set<string>();
    const validatedSubjectActions = new Set<string>();

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
        if (!validatedSubjects.has(ruleSubject)) {
          let subjectBoundary = validatePrivilegeChangeOperation(
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject,
            actorPermission,
            targetUserPermission,
            {
              email: targetUserEmail,
              subject: ruleSubject
            }
          );

          // If new action fails try legacy
          if (
            !subjectBoundary.isValid &&
            permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges
          ) {
            subjectBoundary = validatePrivilegeChangeOperation(
              shouldUseNewPrivilegeSystem,
              ProjectPermissionMemberActions.GrantPrivileges,
              permissionSubject,
              actorPermission,
              targetUserPermission,
              {
                email: targetUserEmail,
                subject: ruleSubject
              }
            );
          }

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
            let subjectActionBoundary = validatePrivilegeChangeOperation(
              shouldUseNewPrivilegeSystem,
              permissionAction,
              permissionSubject,
              actorPermission,
              targetUserPermission,
              {
                email: targetUserEmail,
                subject: ruleSubject,
                action: subjectActionKey
              }
            );

            // If new action fails try legacy
            if (
              !subjectActionBoundary.isValid &&
              permissionAction === ProjectPermissionMemberActions.AssignAdditionalPrivileges
            ) {
              subjectActionBoundary = validatePrivilegeChangeOperation(
                shouldUseNewPrivilegeSystem,
                ProjectPermissionMemberActions.GrantPrivileges,
                permissionSubject,
                actorPermission,
                targetUserPermission,
                {
                  email: targetUserEmail,
                  subject: ruleSubject,
                  action: subjectActionKey
                }
              );
            }

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

  const onCreateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onCreateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);

      const { actorType } = dto.data;
      const { permission } = await $getPermission(dto.permission, scope.value);
      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity] as const);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: dto.data.actorId },
        scope.value
      );

      const permissionAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.AssignAdditionalPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;
      const permissionSubject =
        actorType === ActorType.USER ? ProjectPermissionSub.Member : ProjectPermissionSub.Identity;

      let targetUserEmail: string | undefined;
      if (actorType === ActorType.USER && shouldUseNewPrivilegeSystem) {
        const targetUser = await userDAL.findById(dto.data.actorId);
        targetUserEmail = targetUser?.email ?? undefined;
      }

      let permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        permissionAction,
        permissionSubject,
        permission,
        targetUserPermission,
        actorType === ActorType.USER ? { email: targetUserEmail } : undefined
      );

      // If new action fails try legacy action
      if (!permissionBoundary.isValid && actorType === ActorType.USER) {
        permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          permissionSubject,
          permission,
          targetUserPermission,
          { email: targetUserEmail }
        );
      }
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create additional privileges",
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });

      if (actorType === ActorType.USER && shouldUseNewPrivilegeSystem && dto.data.permissions) {
        validateGrantPrivilegeSubjectActionConditions(
          shouldUseNewPrivilegeSystem,
          permissionAction,
          permissionSubject,
          permission,
          targetUserPermission,
          targetUserEmail,
          dto.data.permissions
        );
      }

      const membership = memberships.find(
        (el) => el[actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"] === dto.data.actorId
      );
      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
    };

  const onUpdateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onUpdateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const { actorType } = dto.selector;

      const { permission } = await $getPermission(dto.permission, scope.value);
      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity] as const);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: dto.selector.actorId },
        scope.value
      );

      const permissionAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.AssignAdditionalPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;
      const permissionSubject =
        actorType === ActorType.USER ? ProjectPermissionSub.Member : ProjectPermissionSub.Identity;

      let targetUserEmail: string | undefined;
      if (actorType === ActorType.USER && shouldUseNewPrivilegeSystem) {
        const targetUser = await userDAL.findById(dto.selector.actorId);
        targetUserEmail = targetUser?.email ?? undefined;
      }

      let permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        permissionAction,
        permissionSubject,
        permission,
        targetUserPermission,
        actorType === ActorType.USER ? { email: targetUserEmail } : undefined
      );

      // If new action fails try legacy action
      if (!permissionBoundary.isValid && actorType === ActorType.USER) {
        permissionBoundary = validatePrivilegeChangeOperation(
          shouldUseNewPrivilegeSystem,
          ProjectPermissionMemberActions.GrantPrivileges,
          permissionSubject,
          permission,
          targetUserPermission,
          { email: targetUserEmail }
        );
      }
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update additional privileges",
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });

      if (actorType === ActorType.USER && shouldUseNewPrivilegeSystem && dto.data.permissions) {
        validateGrantPrivilegeSubjectActionConditions(
          shouldUseNewPrivilegeSystem,
          permissionAction,
          permissionSubject,
          permission,
          targetUserPermission,
          targetUserEmail,
          dto.data.permissions
        );
      }

      const membership = memberships.find(
        (el) => el[actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"] === dto.selector.actorId
      );
      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
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
