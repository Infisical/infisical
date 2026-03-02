import {
  AccessScope,
  ProjectMembershipRole,
  TableName,
  TemporaryPermissionMode,
  TMembershipRolesInsert
} from "@app/db/schemas";
import { TAccessApprovalPolicyApproverDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TSecretApprovalPolicyApproverDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-approver-dal";
import { TSecretApprovalPolicyDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { SearchResourceOperators } from "@app/lib/search-resource/search";

import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TMembershipGroupDALFactory } from "./membership-group-dal";
import {
  TCreateMembershipGroupDTO,
  TDeleteMembershipGroupDTO,
  TGetMembershipGroupByGroupIdDTO,
  TListMembershipGroupDTO,
  TUpdateMembershipGroupDTO
} from "./membership-group-types";
import { newOrgMembershipGroupFactory } from "./org/org-membership-group-factory";
import { newProjectMembershipGroupFactory } from "./project/project-membership-group-factory";

type TMembershipGroupServiceFactoryDep = {
  membershipGroupDAL: TMembershipGroupDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany" | "delete">;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "find">;
  accessApprovalPolicyApproverDAL: Pick<TAccessApprovalPolicyApproverDALFactory, "find">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "find">;
  secretApprovalPolicyApproverDAL: Pick<TSecretApprovalPolicyApproverDALFactory, "find">;
  roleDAL: Pick<TRoleDALFactory, "find">;
  permissionService: TPermissionServiceFactory;
  orgDAL: TOrgDALFactory;
  groupDAL: Pick<TGroupDALFactory, "findById">;
};

export type TMembershipGroupServiceFactory = ReturnType<typeof membershipGroupServiceFactory>;

export const membershipGroupServiceFactory = ({
  membershipGroupDAL,
  roleDAL,
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  secretApprovalPolicyDAL,
  secretApprovalPolicyApproverDAL,
  membershipRoleDAL,
  orgDAL,
  permissionService,
  groupDAL
}: TMembershipGroupServiceFactoryDep) => {
  const scopeFactory = {
    [AccessScope.Organization]: newOrgMembershipGroupFactory({
      orgDAL,
      permissionService,
      groupDAL
    }),
    [AccessScope.Project]: newProjectMembershipGroupFactory({
      membershipGroupDAL,
      orgDAL,
      permissionService
    })
  };

  const createMembership = async (dto: TCreateMembershipGroupDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "Group must have at least one permanent role"
      });
    }
    const isInvalidTemporaryRole = data.roles.some((el) => {
      if (el.isTemporary) {
        if (!el.temporaryAccessStartTime || !el.temporaryRange) {
          return true;
        }
      }
      return false;
    });
    if (isInvalidTemporaryRole) {
      throw new BadRequestError({
        message: "Temporary role must have access start time and range"
      });
    }

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);

    await factory.onCreateMembershipGroupGuard(dto);

    const customInputRoles = data.roles.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;

    const scopeField = factory.getScopeField(dto.scopeData);
    const customRoles = hasCustomRole
      ? await roleDAL.find({
          [scopeField.key]: scopeField.value,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const membership = await membershipGroupDAL.transaction(async (tx) => {
      const existingMembership = await membershipGroupDAL.findOne(
        {
          scope: scopeData.scope,
          ...scopeDatabaseFields,
          actorGroupId: dto.data.groupId
        },
        tx
      );
      if (existingMembership)
        throw new BadRequestError({
          message: "Group is already a member"
        });

      const doc = await membershipGroupDAL.create(
        {
          scope: scopeData.scope,
          ...scopeDatabaseFields,
          actorGroupId: dto.data.groupId
        },
        tx
      );

      const roleDocs: TMembershipRolesInsert[] = [];
      data.roles.forEach((membershipRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
        if (membershipRole.isTemporary) {
          const relativeTimeInMs = membershipRole.temporaryRange ? ms(membershipRole.temporaryRange) : null;
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: membershipRole.temporaryRange,
            temporaryAccessStartTime: new Date(membershipRole.temporaryAccessStartTime as string),
            temporaryAccessEndTime: new Date(
              new Date(membershipRole.temporaryAccessStartTime as string).getTime() + (relativeTimeInMs as number)
            )
          });
        } else {
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null
          });
        }
      });
      await membershipRoleDAL.insertMany(roleDocs, tx);
      return doc;
    });

    return { membership };
  };

  const updateMembership = async (dto: TUpdateMembershipGroupDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateMembershipGroupGuard(dto);

    const customInputRoles = data.roles.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;

    const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "Group must have at least one permanent role"
      });
    }
    const isInvalidTemporaryRole = data.roles.some((el) => {
      if (el.isTemporary) {
        if (!el.temporaryAccessStartTime || !el.temporaryRange) {
          return true;
        }
      }
      return false;
    });
    if (isInvalidTemporaryRole) {
      throw new BadRequestError({
        message: "Temporary role must have access start time and range"
      });
    }

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipGroupDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorGroupId: dto.selector.groupId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "Group doesn't have membership"
      });

    const scopeField = factory.getScopeField(dto.scopeData);
    const customRoles = hasCustomRole
      ? await roleDAL.find({
          [scopeField.key]: scopeField.value,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const membershipDoc = await membershipGroupDAL.transaction(async (tx) => {
      const doc =
        typeof data?.isActive === "undefined"
          ? existingMembership
          : await membershipGroupDAL.updateById(
              existingMembership.id,
              {
                isActive: data.isActive
              },
              tx
            );

      const roleDocs: TMembershipRolesInsert[] = [];
      data.roles.forEach((membershipRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
        if (membershipRole.isTemporary) {
          const relativeTimeInMs = membershipRole.temporaryRange ? ms(membershipRole.temporaryRange) : null;
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: membershipRole.temporaryRange,
            temporaryAccessStartTime: new Date(membershipRole.temporaryAccessStartTime as string),
            temporaryAccessEndTime: new Date(
              new Date(membershipRole.temporaryAccessStartTime as string).getTime() + (relativeTimeInMs as number)
            )
          });
        } else {
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null
          });
        }
      });
      await membershipRoleDAL.delete(
        {
          membershipId: doc.id
        },
        tx
      );
      const roles = await membershipRoleDAL.insertMany(roleDocs, tx);
      return { ...doc, roles };
    });

    return { membership: membershipDoc };
  };

  const deleteMembership = async (dto: TDeleteMembershipGroupDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteMembershipGroupGuard(dto);

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipGroupDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorGroupId: dto.selector.groupId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "Group doesn't have membership"
      });

    if (existingMembership.actorGroupId === dto.permission.id)
      throw new BadRequestError({
        message: "You can't delete your own membership"
      });

    const accessApprovalPolicyApprovers = await accessApprovalPolicyApproverDAL.find({
      approverGroupId: dto.selector.groupId
    });

    // check if group is assigned to any access approval policy
    const accessApprovalPolicyApproverGroupIds = accessApprovalPolicyApprovers.map(({ policyId }) => policyId);
    if (accessApprovalPolicyApprovers.length > 0) {
      const accessApprovalPolicies = await accessApprovalPolicyDAL.find({
        $in: {
          [`${TableName.AccessApprovalPolicy}.id` as "id"]: [...new Set(accessApprovalPolicyApproverGroupIds)]
        },
        projectId: existingMembership.scopeProjectId ?? undefined,
        deletedAt: null
      });

      if (accessApprovalPolicies.length > 0) {
        throw new BadRequestError({
          message: "This group is assigned to an approval policy and cannot be deleted"
        });
      }
    }

    // check if group is assigned to any secret approval policy
    const secretApprovalPolicyApprovers = await secretApprovalPolicyApproverDAL.find({
      approverGroupId: dto.selector.groupId
    });
    const secretApprovalPolicyApproverGroupIds = secretApprovalPolicyApprovers.map(({ policyId }) => policyId);
    if (secretApprovalPolicyApprovers.length > 0) {
      const secretApprovalPolicies = await secretApprovalPolicyDAL.find({
        $in: {
          [`${TableName.SecretApprovalPolicy}.id` as "id"]: [...new Set(secretApprovalPolicyApproverGroupIds)]
        },
        projectId: existingMembership.scopeProjectId ?? undefined,
        deletedAt: null
      });
      if (secretApprovalPolicies.length > 0) {
        throw new BadRequestError({
          message: "This group is assigned to a secret approval policy and cannot be deleted"
        });
      }
    }

    const membershipDoc = await membershipGroupDAL.transaction(async (tx) => {
      await membershipRoleDAL.delete({ membershipId: existingMembership.id }, tx);
      const doc = await membershipGroupDAL.deleteById(existingMembership.id, tx);
      return doc;
    });
    return { membership: membershipDoc };
  };

  const listMemberships = async (dto: TListMembershipGroupDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListMembershipGroupGuard(dto);
    const memberships = await membershipGroupDAL.findGroups({
      scopeData,
      filter: {
        limit: dto.data.limit,
        offset: dto.data.offset,
        name: dto.data.groupName
          ? {
              [SearchResourceOperators.$contains]: dto.data.groupName
            }
          : undefined,
        role: dto.data.roles?.length
          ? {
              [SearchResourceOperators.$in]: dto.data.roles
            }
          : undefined
      }
    });
    return { memberships: memberships.data, totalCount: memberships.totalCount };
  };

  const getMembershipByGroupId = async (dto: TGetMembershipGroupByGroupIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetMembershipGroupByGroupIdGuard(dto);
    const membership = await membershipGroupDAL.getGroupById({
      scopeData,
      groupId: selector.groupId
    });
    if (!membership) throw new NotFoundError({ message: `Group membership not found` });

    return { membership };
  };

  return {
    createMembership,
    updateMembership,
    deleteMembership,
    listMemberships,
    getMembershipByGroupId
  };
};
