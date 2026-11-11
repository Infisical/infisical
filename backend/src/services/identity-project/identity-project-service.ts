import { AccessScope } from "@app/db/schemas";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { NotFoundError } from "@app/lib/errors";

import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TIdentityProjectDALFactory } from "./identity-project-dal";
import {
  TGetProjectIdentityByIdentityIdDTO,
  TGetProjectIdentityByMembershipIdDTO,
  TListProjectIdentityDTO
} from "./identity-project-types";

type TIdentityProjectServiceFactoryDep = {
  identityProjectDAL: TIdentityProjectDALFactory;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
};

export type TIdentityProjectServiceFactory = ReturnType<typeof identityProjectServiceFactory>;

export const identityProjectServiceFactory = ({
  identityProjectDAL,
  projectsDomain,
  membershipIdentityDAL
}: TIdentityProjectServiceFactoryDep) => {
  const listProjectIdentities = async ({
    projectId,
    actor,
    limit,
    offset,
    orderBy,
    orderDirection,
    search
  }: TListProjectIdentityDTO) => {
    const permission = await projectsDomain.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionIdentityActions.Read, subject: ProjectPermissionSub.Identity });

    const identityMemberships = await identityProjectDAL.findByProjectId(projectId, {
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityProjectDAL.getCountByProjectId(projectId, { search });
    const filteredMemberships = identityMemberships.filter((el) =>
      permission.can({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: el.identity.id }
      })
    );

    return { identityMemberships: filteredMemberships, totalCount };
  };

  const getProjectIdentityByIdentityId = async ({
    projectId,
    actor,
    identityId
  }: TGetProjectIdentityByIdentityIdDTO) => {
    const permission = await projectsDomain.getProjectPermission({ actor, projectId });

    permission.assert({
      action: ProjectPermissionIdentityActions.Read,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId }
    });

    const [identityMembership] = await identityProjectDAL.findByProjectId(projectId, { identityId });
    if (!identityMembership)
      throw new NotFoundError({
        message: `Project membership for identity with ID '${identityId} in project with ID '${projectId}' not found`
      });
    return identityMembership;
  };

  const getProjectIdentityByMembershipId = async ({
    identityMembershipId,
    actor
  }: TGetProjectIdentityByMembershipIdDTO) => {
    const membership = await membershipIdentityDAL.findOne({
      id: identityMembershipId,
      scope: AccessScope.Project,
      scopeOrgId: actor.org.id
    });

    if (!membership || !membership.scopeProjectId || !membership.actorIdentityId) {
      throw new NotFoundError({
        message: `Project membership with ID '${identityMembershipId}' not found`
      });
    }

    const permission = await projectsDomain.getProjectPermission({ actor, projectId: membership.scopeProjectId });

    permission.assert({
      action: ProjectPermissionIdentityActions.Read,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: membership.actorIdentityId }
    });

    const [identityMembership] = await identityProjectDAL.findByProjectId(membership.scopeProjectId, {
      identityId: membership.actorIdentityId
    });

    return identityMembership;
  };

  return {
    listProjectIdentities,
    getProjectIdentityByIdentityId,
    getProjectIdentityByMembershipId
  };
};
