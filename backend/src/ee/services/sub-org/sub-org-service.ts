import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, OrgMembershipStatus, SubscriptionProductCategory } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects, OrgPermissionSubOrgActions } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TCreateSubOrgDTO, TListSubOrgDTO, TUpdateSubOrgDTO } from "./sub-org-types";

type TSubOrgServiceFactoryDep = {
  orgDAL: Pick<
    TOrgDALFactory,
    "findOne" | "create" | "transaction" | "listSubOrganizations" | "updateById" | "findById"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
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
  const createSubOrg = async ({ name, permissionActor }: TCreateSubOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId: permissionActor.id,
      actor: permissionActor.type,
      orgId: permissionActor.orgId,
      actorOrgId: permissionActor.orgId,
      actorAuthMethod: permissionActor.authMethod,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSubOrgActions.Create,
      OrgPermissionSubjects.SubOrganization
    );

    const orgLicensePlan = await licenseService.getPlan(permissionActor.rootOrgId);
    if (!orgLicensePlan.get(SubscriptionProductCategory.Platform, "subOrganization")) {
      throw new BadRequestError({
        message: "Sub-organization creation failed. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }

    const existingSubOrg = await orgDAL.findOne({
      parentOrgId: permissionActor.orgId,
      name
    });
    if (existingSubOrg) {
      throw new BadRequestError({ message: `Sub-organization with name ${name} already exists` });
    }

    const organization = await orgDAL.transaction(async (tx) => {
      const org = await orgDAL.create(
        { name, slug: name, rootOrgId: permissionActor.rootOrgId, parentOrgId: permissionActor.orgId },
        tx
      );
      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Organization,
          [permissionActor.type === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"]: permissionActor.id,
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

  const listSubOrgs = async ({ permissionActor, data }: TListSubOrgDTO) => {
    await permissionService.getOrgPermission({
      actorId: permissionActor.id,
      actor: permissionActor.type,
      orgId: permissionActor.rootOrgId,
      actorOrgId: permissionActor.rootOrgId,
      actorAuthMethod: permissionActor.authMethod,
      scope: OrganizationActionScope.Any
    });

    const organizations = await orgDAL.listSubOrganizations({
      actorId: permissionActor.id,
      actorType: permissionActor.type,
      orgId: permissionActor.rootOrgId,
      isAccessible: data?.isAccessible,
      limit: data?.limit,
      offset: data?.offset
    });

    return {
      organizations
    };
  };

  const updateSubOrg = async ({ subOrgId, name, permissionActor }: TUpdateSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: permissionActor.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const { permission } = await permissionService.getOrgPermission({
      actorId: permissionActor.id,
      actor: permissionActor.type,
      orgId: subOrgId,
      actorOrgId: subOrgId,
      actorAuthMethod: permissionActor.authMethod,
      scope: OrganizationActionScope.ChildOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const existingSubOrg = await orgDAL.findOne({
      parentOrgId: subOrg.parentOrgId,
      slug: name
    });

    if (existingSubOrg && existingSubOrg.id !== subOrgId) {
      throw new BadRequestError({ message: `Sub-organization with name ${name} already exists` });
    }

    const organization = await orgDAL.updateById(subOrgId, { name, slug: name });

    return {
      organization
    };
  };

  return {
    createSubOrg,
    listSubOrgs,
    updateSubOrg
  };
};
