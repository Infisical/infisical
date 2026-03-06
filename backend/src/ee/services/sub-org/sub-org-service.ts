import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionSubjects, OrgPermissionSubOrgActions } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TCreateSubOrgDTO, TDeleteSubOrgDTO, TJoinSubOrgDTO, TListSubOrgDTO, TUpdateSubOrgDTO } from "./sub-org-types";

type TSubOrgServiceFactoryDep = {
  orgDAL: Pick<
    TOrgDALFactory,
    "findOne" | "create" | "transaction" | "listSubOrganizations" | "updateById" | "findById" | "deleteById"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipDAL: Pick<TMembershipDALFactory, "create" | "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
};

export type TSubOrgServiceFactory = ReturnType<typeof subOrgServiceFactory>;

export const subOrgServiceFactory = ({
  orgDAL,
  permissionService,
  licenseService,
  membershipDAL,
  membershipRoleDAL
}: TSubOrgServiceFactoryDep) => {
  const createSubOrg = async ({ name, slug, permission }: TCreateSubOrgDTO) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: permission.id,
      actor: permission.type,
      orgId: permission.orgId,
      actorOrgId: permission.orgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionSubOrgActions.Create,
      OrgPermissionSubjects.SubOrganization
    );

    const orgLicensePlan = await licenseService.getPlan(permission.rootOrgId);
    if (!orgLicensePlan.subOrganization) {
      throw new BadRequestError({
        message: "Sub-organization creation failed. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }

    // Generate slug from name if not provided
    const generatedSlug = slug ?? slugify(name, { lowercase: true });

    const existingSubOrg = await orgDAL.findOne({
      parentOrgId: permission.orgId,
      slug: generatedSlug
    });
    if (existingSubOrg) {
      throw new BadRequestError({ message: `Sub-organization with slug "${generatedSlug}" already exists` });
    }

    const organization = await orgDAL.transaction(async (tx) => {
      const org = await orgDAL.create(
        { name, slug: generatedSlug, rootOrgId: permission.rootOrgId, parentOrgId: permission.orgId },
        tx
      );
      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Organization,
          [permission.type === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"]: permission.id,
          scopeOrgId: org.id,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        },
        tx
      );
      await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );
      return org;
    });

    return {
      organization
    };
  };

  const listSubOrgs = async ({ permission, data }: TListSubOrgDTO) => {
    await permissionService.getOrgPermission({
      actorId: permission.id,
      actor: permission.type,
      orgId: permission.rootOrgId,
      actorOrgId: permission.rootOrgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.Any
    });

    const { orgs: organizations, totalCount } = await orgDAL.listSubOrganizations({
      actorId: permission.id,
      actorType: permission.type,
      orgId: permission.rootOrgId,
      isAccessible: data?.isAccessible,
      search: data?.search,
      orderBy: data?.orderBy,
      orderDirection: data?.orderDirection,
      limit: data?.limit,
      offset: data?.offset
    });

    return {
      organizations,
      totalCount
    };
  };

  const updateSubOrg = async ({ subOrgId, name, slug, permission }: TUpdateSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: permission.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: permission.id,
      actor: permission.type,
      orgId: permission.rootOrgId,
      actorOrgId: permission.rootOrgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionSubOrgActions.Edit,
      OrgPermissionSubjects.SubOrganization
    );

    const updateData: { name?: string; slug?: string } = {};

    // Backward compatibility: if only name is provided (no slug), update both name and slug
    // This maintains the legacy behavior where name was used as both display name and slug
    if (name !== undefined && slug === undefined) {
      const generatedSlug = slugify(name, { lowercase: true });

      // Check for slug uniqueness
      const existingSubOrg = await orgDAL.findOne({
        parentOrgId: subOrg.parentOrgId,
        slug: generatedSlug
      });

      if (existingSubOrg && existingSubOrg.id !== subOrgId) {
        throw new BadRequestError({ message: `Sub-organization with slug "${generatedSlug}" already exists` });
      }

      updateData.name = name;
      updateData.slug = generatedSlug;
    } else {
      // update fields independently
      if (name !== undefined) updateData.name = name;

      if (slug !== undefined) {
        // Check for slug uniqueness
        const existingSubOrg = await orgDAL.findOne({
          parentOrgId: subOrg.parentOrgId,
          slug
        });

        if (existingSubOrg && existingSubOrg.id !== subOrgId) {
          throw new BadRequestError({ message: `Sub-organization with slug "${slug}" already exists` });
        }

        updateData.slug = slug;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { organization: subOrg };
    }

    const organization = await orgDAL.updateById(subOrgId, updateData);

    return {
      organization
    };
  };

  const joinSubOrg = async ({ subOrgId, permission }: TJoinSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: permission.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: permission.id,
      actor: permission.type,
      orgId: permission.rootOrgId,
      actorOrgId: permission.rootOrgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionSubOrgActions.DirectAccess,
      OrgPermissionSubjects.SubOrganization
    );

    const actorField = permission.type === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId";
    const existingMembership = await membershipDAL.findOne({
      scope: AccessScope.Organization,
      [actorField]: permission.id,
      scopeOrgId: subOrgId
    });

    if (existingMembership) {
      throw new BadRequestError({ message: "You are already a member of this sub-organization" });
    }

    await orgDAL.transaction(async (tx) => {
      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Organization,
          [actorField]: permission.id,
          scopeOrgId: subOrgId,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        },
        tx
      );
      await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Member
        },
        tx
      );
    });

    return { organization: subOrg };
  };

  const deleteSubOrg = async ({ subOrgId, permission }: TDeleteSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: permission.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: permission.id,
      actor: permission.type,
      orgId: permission.rootOrgId,
      actorOrgId: permission.rootOrgId,
      actorAuthMethod: permission.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionSubOrgActions.Delete,
      OrgPermissionSubjects.SubOrganization
    );

    await orgDAL.deleteById(subOrgId);

    return { organization: subOrg };
  };

  return {
    createSubOrg,
    listSubOrgs,
    updateSubOrg,
    deleteSubOrg,
    joinSubOrg
  };
};
