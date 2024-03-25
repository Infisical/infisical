import { useEffect } from "react";
import { UseFormGetValues, UseFormSetValue } from "react-hook-form";

import { ProjectProps } from "@app/hooks/api/users/types";

import { CheckedProjectsMap } from "../types";
import getFullListOfUncheckedProjects from "../utils/getFullListOfUncheckedProjects";

type Props = {
  filteredProjects: ProjectProps[];
  getValues: UseFormGetValues<{
    projects: CheckedProjectsMap;
  }>;
  workspaces: ProjectProps[];
  setValue: UseFormSetValue<{
    projects: CheckedProjectsMap;
  }>;
};

type GetCheckedProps = {
  fullListOfUncheckedProjects: CheckedProjectsMap;
  previousCheckedProjects: CheckedProjectsMap;
};

const getChecked = ({
  fullListOfUncheckedProjects,
  previousCheckedProjects
}: GetCheckedProps): CheckedProjectsMap => {
  const preservedVals: CheckedProjectsMap = {};

  Object.keys(fullListOfUncheckedProjects).forEach((projectKey) => {
    if (Object.prototype.hasOwnProperty.call(fullListOfUncheckedProjects, projectKey)) {
      const isChecked = previousCheckedProjects && previousCheckedProjects[projectKey];

      preservedVals[projectKey] = isChecked
        ? previousCheckedProjects[projectKey]
        : fullListOfUncheckedProjects[projectKey];
    }
  });

  return preservedVals;
};

const useInitialCheckedProjects = ({
  filteredProjects,
  getValues,
  workspaces,
  setValue
}: Props) => {
  useEffect(() => {
    const fullListOfUncheckedProjects = getFullListOfUncheckedProjects([...workspaces]);
    const previousCheckedProjects = getValues("projects");
    const preservedVals = getChecked({
      fullListOfUncheckedProjects,
      previousCheckedProjects
    });
    setValue("projects", preservedVals);
  }, [filteredProjects, getValues, setValue, workspaces]);
};

export default useInitialCheckedProjects;
