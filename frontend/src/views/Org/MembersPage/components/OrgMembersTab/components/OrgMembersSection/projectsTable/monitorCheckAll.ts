import { CheckedProjectsMap } from "../types";

const monitorCheckAll = ({ state }: { state: CheckedProjectsMap }): CheckedProjectsMap => {
  const newState = { ...state };
  // check if all projects are enabled to check all checkbox programmatically
  const { all, ...projects } = newState;
  const numOfProjects = Object.keys(projects).length;

  let numOfCheckedProjects: number = 0;
  Object.keys(projects).forEach((projectKey) => {
    if (projects[projectKey]) {
      numOfCheckedProjects += 1;
    }
  });

  if (numOfProjects === numOfCheckedProjects) {
    newState.all = true;
  }

  return newState;
};

export default monitorCheckAll;
