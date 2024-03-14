import { ProjectProps } from "@app/hooks/api/users/types";

import { CheckedProjectsMap } from "./types";

const getInitialCheckedProjects = (projects: Array<ProjectProps>): CheckedProjectsMap => {
  const initialCheckProjectsMap: CheckedProjectsMap = {
    all: false
  };

  projects.forEach((project: ProjectProps) => {
    initialCheckProjectsMap[project.id] = false;
  });

  return initialCheckProjectsMap;
};

export default getInitialCheckedProjects;
