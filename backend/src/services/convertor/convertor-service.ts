import { AccessScope } from "@app/db/schemas";
import { NotFoundError } from "@app/lib/errors";

import { TMembershipDALFactory } from "../membership/membership-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";

type TConvertorServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "getMembershipById" | "findOne">;
};

export type TConvertorServiceFactory = ReturnType<typeof convertorServiceFactory>;

export const convertorServiceFactory = ({
  projectDAL,
  membershipDAL,
  additionalPrivilegeDAL
}: TConvertorServiceFactoryDep) => {
  const projectSlugToId = async (dto: { slug: string; orgId: string }) => {
    const project = await projectDAL.findOne({
      orgId: dto.orgId,
      slug: dto.slug
    });
    if (!project) throw new NotFoundError({ message: `Project with slug ${dto.slug} not found` });
    return project;
  };

  const userMembershipIdToUserId = async (membershipId: string, scope: AccessScope, orgId: string) => {
    const membership = await membershipDAL.findOne({
      scope,
      id: membershipId,
      scopeOrgId: orgId
    });
    if (!membership || !membership.actorUserId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }
    return { userId: membership.actorUserId, membership };
  };

  const groupMembershipIdToGroupId = async (membershipId: string, scope: AccessScope, orgId: string) => {
    const membership = await membershipDAL.findOne({
      scope,
      id: membershipId,
      scopeOrgId: orgId
    });
    if (!membership || !membership.actorGroupId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }

    return { groupId: membership.actorGroupId, membership };
  };

  const identityMembershipIdToIdentityId = async (membershipId: string, scope: AccessScope, orgId: string) => {
    const membership = await membershipDAL.findOne({
      scope,
      id: membershipId,
      scopeOrgId: orgId
    });
    if (!membership || !membership.actorIdentityId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }

    return { identityId: membership.actorIdentityId, membership };
  };

  const identityIdToMembershipId = async (identityId: string, scope: AccessScope, scopeId: string) => {
    let fieldName = "scopeOrgId";
    if (scope === AccessScope.Project) {
      fieldName = "scopeProjectId";
    } else if (scope === AccessScope.Namespace) {
      fieldName = "scopeNamespaceId";
    }

    const membership = await membershipDAL.findOne({
      scope,
      actorIdentityId: identityId,
      [fieldName]: scopeId
    });

    if (!membership) {
      throw new NotFoundError({ message: `Identity with id ${identityId} not found` });
    }

    return { membershipId: membership.id, membership };
  };

  const additionalPrivilegeIdToMembershipId = async (privilegeId: string, scope: AccessScope, orgId: string) => {
    const membership = await additionalPrivilegeDAL.getMembershipById(privilegeId);
    if (!membership || membership.scope !== scope || membership.scopeOrgId !== orgId) {
      throw new NotFoundError({ message: `Privilege with id ${privilegeId} not found` });
    }

    return { membership, membershipId: membership.id };
  };
  const additionalPrivilegeNameToId = async (privilegeName: string, membershipId: string) => {
    const privilege = await additionalPrivilegeDAL.findOne({
      name: privilegeName,
      membershipId
    });
    if (!privilege) {
      throw new NotFoundError({ message: `Privilege with slug ${privilegeName} not found` });
    }

    return { privilegeId: privilege.id, privilege };
  };

  return {
    projectSlugToId,
    userMembershipIdToUserId,
    groupMembershipIdToGroupId,
    identityMembershipIdToIdentityId,
    additionalPrivilegeIdToMembershipId,
    additionalPrivilegeNameToId,
    identityIdToMembershipId
  };
};
