import slugify from "@sindresorhus/slugify";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import { TActorContext, TActorContexts } from "@app/domains/lib/actor-context";
import { Meter, TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionSubjects,
  OrgPermissionSubOrgActions,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { bootstrapPamProject } from "@app/ee/services/pam-project/pam-project-bootstrap";
import { bootstrapSecretScanningProject } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-project-bootstrap";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError } from "@app/lib/errors";
import { bootstrapCertManagerProject } from "@app/services/cert-manager-instance/cert-manager-project-bootstrap";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCreateSubOrgDTO, TDeleteSubOrgDTO, TJoinSubOrgDTO, TListSubOrgDTO, TUpdateSubOrgDTO } from "./sub-org-types";

type TSubOrgServiceFactoryDep = {
  orgDAL: Pick<
    TOrgDALFactory,
    "findOne" | "create" | "transaction" | "listSubOrganizations" | "updateById" | "findById" | "deleteById"
  >;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  actorContexts: Pick<TActorContexts, "forPrincipal">;
  licenseDomain: TLicenseDomain;
  membershipDAL: Pick<TMembershipDALFactory, "create" | "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "create" | "findOne">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "create">;
};

export type TSubOrgServiceFactory = ReturnType<typeof subOrgServiceFactory>;

export const subOrgServiceFactory = ({
  orgDAL,
  organizationsDomain,
  actorContexts,
  licenseDomain,
  membershipDAL,
  membershipRoleDAL,
  projectDAL,
  certificatePolicyDAL
}: TSubOrgServiceFactoryDep) => {
  // Sub-organizations are listed and managed in the root org, so a request scoped to a sub-org is checked there.
  const $rootOrgActor = async (actor: TActorContext) =>
    actor.org.id === actor.org.rootOrgId ? actor : actorContexts.forPrincipal(actor.principal, actor.org.rootOrgId);

  const createSubOrg = async ({ name, slug, actor }: TCreateSubOrgDTO) => {
    const orgPermission = await organizationsDomain.getOrgPermission({
      actor,
      scope: OrganizationActionScope.ParentOrganization
    });

    orgPermission.assert({ action: OrgPermissionSubOrgActions.Create, subject: OrgPermissionSubjects.SubOrganization });

    const orgLicensePlan = await licenseDomain.getPlan(actor.org.rootOrgId);
    if (!orgLicensePlan.subOrganization) {
      throw new BadRequestError({
        message: "Sub-organization creation failed. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }

    // Generate slug from name if not provided
    const generatedSlug = slug ?? slugify(name, { lowercase: true });

    const existingSubOrg = await orgDAL.findOne({
      parentOrgId: actor.org.id,
      slug: generatedSlug
    });
    if (existingSubOrg) {
      throw new BadRequestError({ message: `Sub-organization with slug "${generatedSlug}" already exists` });
    }

    const organization = await orgDAL.transaction(async (tx) => {
      const org = await orgDAL.create(
        { name, slug: generatedSlug, rootOrgId: actor.org.rootOrgId, parentOrgId: actor.org.id },
        tx
      );
      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Organization,
          [actor.principal.type === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"]: actor.principal.id,
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

      await bootstrapCertManagerProject(
        {
          orgId: org.id,
          adminUserIds: actor.principal.type === ActorType.USER ? [actor.principal.id] : [],
          adminIdentityIds: actor.principal.type === ActorType.IDENTITY ? [actor.principal.id] : []
        },
        { projectDAL, membershipDAL, membershipRoleDAL, certificatePolicyDAL },
        tx
      );

      await bootstrapPamProject(
        {
          orgId: org.id,
          adminUserIds: actor.principal.type === ActorType.USER ? [actor.principal.id] : [],
          adminIdentityIds: actor.principal.type === ActorType.IDENTITY ? [actor.principal.id] : []
        },
        { projectDAL, membershipDAL, membershipRoleDAL },
        tx
      );

      await bootstrapSecretScanningProject(
        {
          orgId: org.id,
          adminUserIds: actor.principal.type === ActorType.USER ? [actor.principal.id] : [],
          adminIdentityIds: actor.principal.type === ActorType.IDENTITY ? [actor.principal.id] : []
        },
        { projectDAL, membershipDAL, membershipRoleDAL },
        tx
      );

      return org;
    });

    licenseDomain.emit(organization.id, Meter.PamIdentities.key);

    return {
      organization
    };
  };

  const listSubOrgs = async ({ actor, data }: TListSubOrgDTO) => {
    await organizationsDomain.getOrgPermission({ actor: await $rootOrgActor(actor) });

    const { orgs: organizations, totalCount } = await orgDAL.listSubOrganizations({
      actorId: actor.principal.id,
      actorType: actor.principal.type,
      orgId: actor.org.rootOrgId,
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

  const updateSubOrg = async ({ subOrgId, name, slug, actor }: TUpdateSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: actor.org.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const orgPermission = await organizationsDomain.getOrgPermission({
      actor: await $rootOrgActor(actor),
      scope: OrganizationActionScope.ParentOrganization
    });

    orgPermission.assert({ action: OrgPermissionSubOrgActions.Edit, subject: OrgPermissionSubjects.SubOrganization });

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

  const joinSubOrg = async ({ subOrgId, actor }: TJoinSubOrgDTO) => {
    const orgLicensePlan = await licenseDomain.getPlan(actor.org.rootOrgId);
    if (!orgLicensePlan.subOrganization) {
      throw new BadRequestError({
        message:
          "Sub-organization feature is not available. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }

    const subOrg = await orgDAL.findOne({
      rootOrgId: actor.org.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const orgPermission = await organizationsDomain.getOrgPermission({
      actor: await $rootOrgActor(actor),
      scope: OrganizationActionScope.ParentOrganization
    });

    orgPermission.assert({
      action: OrgPermissionSubOrgActions.DirectAccess,
      subject: OrgPermissionSubjects.SubOrganization
    });

    const actorField = actor.principal.type === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId";
    const existingMembership = await membershipDAL.findOne({
      scope: AccessScope.Organization,
      [actorField]: actor.principal.id,
      scopeOrgId: subOrgId
    });

    if (existingMembership) {
      throw new BadRequestError({ message: "You are already a member of this sub-organization" });
    }

    await orgDAL.transaction(async (tx) => {
      const membership = await membershipDAL.create(
        {
          scope: AccessScope.Organization,
          [actorField]: actor.principal.id,
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

  const deleteSubOrg = async ({ subOrgId, actor }: TDeleteSubOrgDTO) => {
    const subOrg = await orgDAL.findOne({
      rootOrgId: actor.org.rootOrgId,
      id: subOrgId
    });
    if (!subOrg) {
      throw new BadRequestError({ message: "Sub-organization not found" });
    }

    const orgPermission = await organizationsDomain.getOrgPermission({
      actor: await $rootOrgActor(actor),
      scope: OrganizationActionScope.ParentOrganization
    });

    orgPermission.assert({ action: OrgPermissionSubOrgActions.Delete, subject: OrgPermissionSubjects.SubOrganization });

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
