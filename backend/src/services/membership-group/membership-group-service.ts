import { ProjectMembershipRole, TemporaryPermissionMode, TMembershipRolesInsert } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { SearchResourceOperators } from "@app/lib/search-resource/search";

import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TMembershipGroupDALFactory } from "./membership-group-dal";
import {
  TCreateMembershipGroupDTO,
  TDeleteMembershipGroupDTO,
  TGetMembershipGroupByGroupIdDTO,
  TListMembershipGroupDTO,
  TMembershipGroupScopeFactory,
  TUpdateMembershipGroupDTO
} from "./membership-group-types";

type TMembershipGroupServiceFactoryDep = {
  membershipGroupDAL: TMembershipGroupDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany" | "delete">;
  roleDAL: Pick<TRoleDALFactory, "find">;
};

export type TMembershipGroupServiceFactory = ReturnType<typeof membershipGroupServiceFactory>;

export const membershipGroupServiceFactory = ({
  membershipGroupDAL,
  roleDAL,
  membershipRoleDAL
}: TMembershipGroupServiceFactoryDep) => {
  const scopeFactory: Record<string, TMembershipGroupScopeFactory> = {};

  const createMembership = async (dto: TCreateMembershipGroupDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    const hasOnePermanentRole = data.roles.some((el) => el.isTemporary);
    if (hasOnePermanentRole) {
      throw new BadRequestError({
        message: "Group must have atleast one permanent role"
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

    const hasOnePermanentRole = data.roles.some((el) => el.isTemporary);
    if (hasOnePermanentRole) {
      throw new BadRequestError({
        message: "Group must have atleast one permanent role"
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
      actorIdentityId: dto.selector.groupId
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
      const doc = await membershipGroupDAL.updateById(
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
      await membershipRoleDAL.insertMany(roleDocs, tx);
      return doc;
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
      actorIdentityId: dto.selector.groupId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "Group doesn't have membership"
      });

    if (existingMembership.actorIdentityId === dto.permission.id)
      throw new BadRequestError({
        message: "You can't delete you own membership"
      });

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
        role: dto.data.roles.length
          ? {
              [SearchResourceOperators.$in]: dto.data.roles
            }
          : undefined
      }
    });
    return memberships;
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

    return membership;
  };

  return {
    createMembership,
    updateMembership,
    deleteMembership,
    listMemberships,
    getMembershipByGroupId
  };
};
