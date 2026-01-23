import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TListProjectGroupUsersDTO } from "@app/ee/services/group/group-types";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionGroupActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";

import { TGroupDALFactory } from "../../ee/services/group/group-dal";
import { TProjectDALFactory } from "../project/project-dal";

type TGroupProjectServiceFactoryDep = {
  groupDAL: Pick<TGroupDALFactory, "findOne" | "findAllGroupPossibleUsers">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "findProjectGhostUser" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissionByRoles">;
};

export type TGroupProjectServiceFactory = ReturnType<typeof groupProjectServiceFactory>;

export const groupProjectServiceFactory = ({
  groupDAL,
  projectDAL,
  permissionService
}: TGroupProjectServiceFactoryDep) => {
  const listProjectGroupUsers = async ({
    id,
    projectId,
    offset,
    limit,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    filter
  }: TListProjectGroupUsersDTO) => {
    const project = await projectDAL.findById(projectId);

    if (!project) {
      throw new NotFoundError({ message: `Failed to find project with ID ${projectId}` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);

    const { members, totalCount } = await groupDAL.findAllGroupPossibleUsers({
      orgId: project.orgId,
      groupId: id,
      offset,
      limit,
      username,
      search,
      filter
    });

    return { users: members, totalCount };
  };

  return {
    listProjectGroupUsers
  };
};
