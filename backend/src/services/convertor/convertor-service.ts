import { NotFoundError } from "@app/lib/errors";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { AccessScope, AccessScopeData } from "@app/db/schemas";

type TConvertorServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
};

export type TConvertorServiceFactory = ReturnType<typeof convertorServiceFactory>;

export const convertorServiceFactory = ({ projectDAL, membershipDAL }: TConvertorServiceFactoryDep) => {
  const $getScopeDatabaseFields = (scopeData: AccessScopeData) => {
    if (scopeData.scope === AccessScope.Organization) {
      return { scopeOrgId: scopeData.orgId };
    }

    if (scopeData.scope === AccessScope.Namespace) {
      return { scopeNamespaceId: scopeData.namespaceId, scopeOrgId: scopeData.orgId };
    }

    return { scopeProjectId: scopeData.projectId, scopeOrgId: scopeData.orgId };
  };

  const projectSlugToId = async (dto: { slug: string; orgId: string }) => {
    const project = await projectDAL.findOne({
      orgId: dto.orgId,
      slug: dto.slug
    });
    if (!project) throw new NotFoundError({ message: `Project with slug ${slug} not found` });
    return project;
  };

  const userMembershipIdToUserId = async (scopeData: AccessScopeData, membershipId: string) => {
    const dbFields = $getScopeDatabaseFields(scopeData);

    const membership = await membershipDAL.findOne({
      scope: scopeData.scope,
      id: membershipId,
      ...dbFields,
      scopeOrgId: scopeData.orgId
    });
    if (!membership || !membership.actorUserId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }
    return membership.actorUserId;
  };

  const groupMembershipIdToGroupId = async (scopeData: AccessScopeData, membershipId: string) => {
    const dbFields = $getScopeDatabaseFields(scopeData);

    const membership = await membershipDAL.findOne({
      scope: scopeData.scope,
      id: membershipId,
      ...dbFields,
      scopeOrgId: scopeData.orgId
    });
    if (!membership || !membership.actorGroupId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }

    return membership.actorGroupId;
  };

  const identityMembershipIdToGroupId = async (scopeData: AccessScopeData, membershipId: string) => {
    const dbFields = $getScopeDatabaseFields(scopeData);

    const membership = await membershipDAL.findOne({
      scope: scopeData.scope,
      id: membershipId,
      ...dbFields,
      scopeOrgId: scopeData.orgId
    });
    if (!membership || !membership.actorIdentityId) {
      throw new NotFoundError({ message: `Membership with id ${membershipId} not found` });
    }

    return membership.actorIdentityId;
  };

  return {
    projectSlugToId,
    userMembershipIdToUserId,
    groupMembershipIdToGroupId,
    identityMembershipIdToGroupId
  };
};
