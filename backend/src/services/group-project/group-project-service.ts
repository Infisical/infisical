import {
  ProjectPermissionGroupActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { TListProjectGroupUsersDTO } from "@app/ee/services/group/group-types";

import { TGroupDALFactory } from "../../ee/services/group/group-dal";

type TGroupProjectServiceFactoryDep = {
  groupDAL: Pick<TGroupDALFactory, "findOne" | "findAllGroupPossibleUsers">;
  projectPermissionService: TProjectPermissionService;
};

export type TGroupProjectServiceFactory = ReturnType<typeof groupProjectServiceFactory>;

export const groupProjectServiceFactory = ({ groupDAL, projectPermissionService }: TGroupProjectServiceFactoryDep) => {
  const listProjectGroupUsers = async ({
    id,
    projectId,
    offset,
    limit,
    username,
    actor,
    search,
    filter
  }: TListProjectGroupUsersDTO) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionGroupActions.Read, subject: ProjectPermissionSub.Groups });

    // getProjectPermission above throws NotFoundError if the project doesn't exist and
    // guarantees actor.org.id === project.orgId, so no separate project lookup is needed.
    const { members, totalCount } = await groupDAL.findAllGroupPossibleUsers({
      orgId: actor.org.id,
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
