import { Workspace } from "@app/hooks/api/types";
import { ProjectProps } from "@app/hooks/api/users/types";

type Props = {
  workspaces: Workspace[];
  userProjects: ProjectProps[];
};

const checkIfThereAreMoreProjectsToAdd = ({ workspaces, userProjects }: Props): boolean => {
  const availableWorkspaces = workspaces.filter((workspace) => {
    const workspaceAlreadyExist = userProjects?.join(",").indexOf(workspace.name) >= 0;
    return !workspaceAlreadyExist;
  });

  return Boolean(availableWorkspaces.length);
};

export default checkIfThereAreMoreProjectsToAdd;
