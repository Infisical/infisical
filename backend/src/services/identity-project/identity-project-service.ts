import { ForbiddenError, subject } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
};

export type TIdentityProjectServiceFactory = ReturnType<typeof identityProjectServiceFactory>;

export const identityProjectServiceFactory = ({
  identityProjectDAL,
  permissionService,
  membershipIdentityDAL
}: TIdentityProjectServiceFactoryDep) => {
  const listProjectIdentities = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit,
    offset,
    orderBy,
    orderDirection,
    search
  }: TListProjectIdentityDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );

    const identityMemberships = await identityProjectDAL.findByProjectId(projectId, {
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityProjectDAL.getCountByProjectId(projectId, { search });
    const filteredMemberships = identityMemberships.filter((el) =>
      permission.can(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId: el.identity.id })
      )
    );

    return { identityMemberships: filteredMemberships, totalCount };
  };

  const getProjectIdentityByIdentityId = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    identityId
  }: TGetProjectIdentityByIdentityIdDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId })
    );

    const [identityMembership] = await identityProjectDAL.findByProjectId(projectId, { identityId });
    if (!identityMembership)
      throw new NotFoundError({
        message: `Project membership for identity with ID '${identityId} in project with ID '${projectId}' not found`
      });
    return identityMembership;
  };

  const getProjectIdentityByMembershipId = async ({
    identityMembershipId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetProjectIdentityByMembershipIdDTO) => {
    const membership = await membershipIdentityDAL.findOne({
      id: identityMembershipId,
      scope: AccessScope.Project,
      scopeOrgId: actorOrgId
    });

    if (!membership || !membership.scopeProjectId || !membership.actorIdentityId) {
      throw new NotFoundError({
        message: `Project membership with ID '${identityMembershipId}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: membership.scopeProjectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: membership.actorIdentityId })
    );

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
