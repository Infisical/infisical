import { ProjectProps } from "@app/hooks/api/users/types";

import { CheckboxKeys, CheckedProjectsMap } from "../types";

const getFullListOfUncheckedProjects = (projects: Array<ProjectProps>): CheckedProjectsMap => {
  const fullListOfUncheckedProjects: CheckedProjectsMap = {
    [CheckboxKeys.ALL]: false
  };

  projects.forEach((project: ProjectProps) => {
    fullListOfUncheckedProjects[project.id] = false;
  });

  return fullListOfUncheckedProjects;
};

export default getFullListOfUncheckedProjects;
