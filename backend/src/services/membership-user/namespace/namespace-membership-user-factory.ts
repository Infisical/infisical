import { AccessScope, NamespaceMembershipRole } from "@app/db/schemas";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";

import { TMembershipUserScopeFactory } from "../membership-user-types";
import {
  NamespacePermissionMemberActions,
  NamespacePermissionSubjects,
  isCustomNamespaceRole
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenError } from "@casl/ability";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TMembershipUserDALFactory } from "../membership-user-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getConfig } from "@app/lib/config/env";

type TNamespaceMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission" | "getNamespacePermissionByRoles">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export const newNamespaceMembershipUserFactory = ({
  permissionService,
  licenseService,
  smtpService,
  membershipUserDAL
}: TNamespaceMembershipUserScopeFactoryDep): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { scopeOrgId: dto.orgId, scopeNamespaceId: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = (role) => isCustomNamespaceRole(role);

  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (
    dto,
    newUsers
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission, memberships } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionMemberActions.Create,
      NamespacePermissionSubjects.Member
    );

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        name: "InviteUser",
        message: "Failed to invite member to namespace. Upgrade plan to use namespace."
      });
    }

    const orgMemberships = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      scopeOrgId: dto.permission.orgId,
      $in: {
        actorUserId: newUsers.map((el) => el.id)
      }
    });
    if (orgMemberships.length !== newUsers.length) {
      const missingUsers = newUsers
        .filter((el) => !orgMemberships.find((memb) => memb.actorUserId === el.id))
        .map((el) => el.email);
      throw new BadRequestError({ message: `Users ${missingUsers.join(",")} not part of organization` });
    }

    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
    const permissionRoles = await permissionService.getNamespacePermissionByRoles(
      dto.data.roles.filter((el) => el.role !== NamespaceMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        NamespacePermissionMemberActions.GrantPrivileges,
        NamespacePermissionSubjects.Member,
        permission,
        permissionRole.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create user namespace membership",
            shouldUseNewPrivilegeSystem,
            NamespacePermissionMemberActions.GrantPrivileges,
            NamespacePermissionSubjects.Member
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async (
    dto,
    newMembers
  ) => {
    const appCfg = getConfig();
    const scope = getScopeField(dto.scopeData);
    const namespace = await namespaceDAL.findById(scope.value);

    const emails = newMembers.filter((el) => Boolean(el?.email)).map((el) => el?.email as string);
    if (emails.length) {
      await smtpService.sendMail({
        template: SmtpTemplates.NamespaceInvite,
        subjectLine: "Infisical namespace invitation",
        recipients: emails,
        substitutions: {
          namespaceName: namespace.name,
          callback_url: `${appCfg.SITE_URL}/login`
        }
      });
    }
    return { signUpTokens: [] };
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission, memberships } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionMemberActions.Edit,
      NamespacePermissionSubjects.Member
    );

    const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
    const permissionRoles = await permissionService.getNamespacePermissionByRoles(
      dto.data.roles.filter((el) => el.role !== NamespaceMembershipRole.NoAccess).map((el) => el.role),
      scope.value
    );

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        NamespacePermissionMemberActions.GrantPrivileges,
        NamespacePermissionSubjects.Member,
        permission,
        permissionRole.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update user namespace membership",
            shouldUseNewPrivilegeSystem,
            NamespacePermissionMemberActions.GrantPrivileges,
            NamespacePermissionSubjects.Member
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionMemberActions.Delete,
      NamespacePermissionSubjects.Member
    );
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionMemberActions.Read,
      NamespacePermissionSubjects.Member
    );
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionMemberActions.Read,
      NamespacePermissionSubjects.Member
    );
  };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
