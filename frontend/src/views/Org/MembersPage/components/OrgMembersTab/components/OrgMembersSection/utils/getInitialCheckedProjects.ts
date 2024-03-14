import { ProjectProps } from "@app/hooks/api/users/types";

import { CheckboxKeys, CheckedProjectsMap } from "../types";

const getInitialCheckedProjects = (projects: Array<ProjectProps>): CheckedProjectsMap => {
  const initialCheckProjectsMap: CheckedProjectsMap = {
    [CheckboxKeys.ALL]: false
  };

  projects.forEach((project: ProjectProps) => {
    initialCheckProjectsMap[project.id] = false;
  });

  return initialCheckProjectsMap;
};

export default getInitialCheckedProjects;
