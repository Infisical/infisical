import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TIdentityGroupDALFactory } from "./identity-group-dal";
import { addIdentitiesToGroupByIdentityIds, removeIdentitiesFromGroupByIdentityIds } from "./identity-group-fns";
import { TIdentityGroupMembershipDALFactory } from "./identity-group-membership-dal";
import { TIdentityGroupProjectDALFactory } from "./identity-group-project-membership-dal";
import {
  TAddIdentityToGroupDTO,
  TCreateIdentityGroupDTO,
  TDeleteIdentityGroupDTO,
  TGetIdentityGroupByIdDTO,
  TListIdentityGroupIdentitiesDTO,
  TRemoveIdentityFromGroupDTO,
  TUpdateIdentityGroupDTO
} from "./identity-group-types";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";

type TIdentityGroupServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "find" | "findOne" | "transaction">;
  identityGroupDAL: Pick<
    TIdentityGroupDALFactory,
    "create" | "findOne" | "update" | "delete" | "findAllIdentityGroupPossibleMembers" | "findById" | "transaction"
  >;
  identityGroupProjectDAL: Pick<TIdentityGroupProjectDALFactory, "find">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "find">;
  identityGroupMembershipDAL: Pick<
    TIdentityGroupMembershipDALFactory,
    "findOne" | "delete" | "filterProjectsByIdentityMembership" | "transaction" | "insertMany" | "find"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityGroupServiceFactory = ReturnType<typeof identityGroupServiceFactory>;

export const identityGroupServiceFactory = ({
  identityDAL,
  identityGroupDAL,
  identityGroupProjectDAL,
  identityOrgMembershipDAL,
  identityGroupMembershipDAL,
  projectDAL,
  permissionService,
  licenseService
}: TIdentityGroupServiceFactoryDep) => {
  const createIdentityGroup = async ({
    name,
    slug,
    role,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateIdentityGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Create,
      OrgPermissionSubjects.IdentityGroups
    );

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create identity group due to plan restriction. Upgrade plan to create identity groups."
      });

    const { role: customRole } = await permissionService.getOrgPermissionByRole(role, actorOrgId);

    const isCustomRole = Boolean(customRole);
    const hasPrivilegesToAssignRole = permission.can(
      OrgPermissionIdentityGroupActions.Create,
      OrgPermissionSubjects.IdentityGroups
    );

    if (!hasPrivilegesToAssignRole) {
      throw new BadRequestError({ message: "Failed to create identity group due to insufficient privileges" });
    }

    if (isCustomRole) {
      throw new BadRequestError({ message: "Failed to assign custom role due to insufficient privileges" });
    }

    const existingIdentityGroup = await identityGroupDAL.findOne({ orgId: actorOrgId, name });

    if (existingIdentityGroup) {
      throw new BadRequestError({
        message: `Failed to create identity group with name '${name}'. Identity group with the same name already exists`
      });
    }

    const identityGroup = await identityGroupDAL.create({
      name,
      slug: slug ? slugify(slug) : slugify(`${name}-${alphaNumericNanoId(4)}`),
      orgId: actorOrgId,
      role: customRole ? OrgMembershipRole.Custom : role,
      roleId: customRole?.id ?? null
    });

    return { ...identityGroup, customRole };
  };

  const updateIdentityGroup = async ({
    id,
    name,
    slug,
    role,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateIdentityGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Edit,
      OrgPermissionSubjects.IdentityGroups
    );

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update identity group due to plan restriction. Upgrade plan to update identity groups."
      });

    const identityGroup = await identityGroupDAL.findById(id);

    if (!identityGroup) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    if (identityGroup.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { role: customOrgRole } = await permissionService.getOrgPermissionByRole(role, actorOrgId);

      const isCustomRole = Boolean(customOrgRole);
      const hasPrivilegesToAssignRole = permission.can(
        OrgPermissionIdentityGroupActions.Edit,
        OrgPermissionSubjects.IdentityGroups
      );

      if (!hasPrivilegesToAssignRole) {
        throw new BadRequestError({ message: "Failed to edit identity group due to insufficient privileges" });
      }

      if (isCustomRole) customRole = customOrgRole;
    }

    const updatedIdentityGroup = await identityGroupDAL.transaction(async (tx) => {
      if (name) {
        const existingIdentityGroup = await identityGroupDAL.findOne({ orgId: actorOrgId, name }, tx);

        if (existingIdentityGroup && existingIdentityGroup.id !== id) {
          throw new BadRequestError({
            message: `Failed to update identity group with name '${name}'. Identity group with the same name already exists`
          });
        }
      }

      const [updated] = await identityGroupDAL.update(
        {
          id: identityGroup.id
        },
        {
          name,
          slug: slug ? slugify(slug) : undefined,
          ...(role
            ? {
                role: customRole ? OrgMembershipRole.Custom : role,
                roleId: customRole?.id ?? null
              }
            : {})
        },
        tx
      );

      return updated;
    });

    return updatedIdentityGroup;
  };

  const deleteIdentityGroup = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteIdentityGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Delete,
      OrgPermissionSubjects.IdentityGroups
    );

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete identity group due to plan restriction. Upgrade plan to delete identity groups."
      });

    const [identityGroup] = await identityGroupDAL.delete({
      id,
      orgId: actorOrgId
    });

    return identityGroup;
  };

  const getIdentityGroupById = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetIdentityGroupByIdDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Read,
      OrgPermissionSubjects.IdentityGroups
    );

    const identityGroup = await identityGroupDAL.findById(id);

    if (!identityGroup) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    if (identityGroup.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    return identityGroup;
  };

  const listIdentityGroupIdentities = async ({
    id,
    offset,
    limit,
    search,
    filter,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListIdentityGroupIdentitiesDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Read,
      OrgPermissionSubjects.IdentityGroups
    );

    const identityGroup = await identityGroupDAL.findById(id);

    if (!identityGroup) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    if (identityGroup.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    const { members, totalCount } = await identityGroupDAL.findAllIdentityGroupPossibleMembers({
      orgId: actorOrgId,
      groupId: id,
      offset,
      limit,
      search,
      filter
    });

    return {
      identities: members,
      totalCount
    };
  };

  const addIdentityToGroup = async ({
    id,
    identityId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddIdentityToGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Edit,
      OrgPermissionSubjects.IdentityGroups
    );

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.identityGroups)
      throw new BadRequestError({
        message: "Failed to add identity to group due to plan restriction. Upgrade plan to add identity to groups."
      });

    const identityGroup = await identityGroupDAL.findById(id);

    if (!identityGroup) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    if (identityGroup.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    const identity = await identityDAL.findOne({ id: identityId });

    if (!identity) {
      throw new NotFoundError({
        message: `Failed to find identity with ID '${identityId}'`
      });
    }

    await addIdentitiesToGroupByIdentityIds({
      group: identityGroup,
      identityIds: [identityId],
      identityDAL,
      identityGroupMembershipDAL,
      identityOrgMembershipDAL,
      identityGroupProjectDAL,
      projectDAL
    });

    return { identityGroup };
  };

  const removeIdentityFromGroup = async ({
    id,
    identityId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveIdentityFromGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionIdentityGroupActions.Edit,
      OrgPermissionSubjects.IdentityGroups
    );

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.identityGroups)
      throw new BadRequestError({
        message:
          "Failed to remove identity from group due to plan restriction. Upgrade plan to remove identity from groups."
      });

    const identityGroup = await identityGroupDAL.findById(id);

    if (!identityGroup) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    if (identityGroup.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Failed to find identity group with ID '${id}'`
      });
    }

    const identity = await identityDAL.findOne({ id: identityId });

    if (!identity) {
      throw new NotFoundError({
        message: `Failed to find identity with ID '${identityId}'`
      });
    }

    await removeIdentitiesFromGroupByIdentityIds({
      group: identityGroup,
      identityIds: [identityId],
      identityDAL,
      identityGroupMembershipDAL
    });

    return { identityGroup };
  };

  return {
    createIdentityGroup,
    updateIdentityGroup,
    deleteIdentityGroup,
    getIdentityGroupById,
    listIdentityGroupIdentities,
    addIdentityToGroup,
    removeIdentityFromGroup
  };
};
