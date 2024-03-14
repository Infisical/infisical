import { useEffect, useState } from "react";

import { ProjectProps } from "@app/hooks/api/users/types";

import { UseFilteredProjectsProps } from "./types";

const useFilteredProjects = ({ userProjects, workspaces }: UseFilteredProjectsProps) => {
  const [filteredProjects, setFilteredProjects] = useState<Array<ProjectProps>>([]);
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    const filtered = workspaces.filter((project: ProjectProps) => {
      const projectAlreadyExist = userProjects.join(",").indexOf(project.name) >= 0;
      return project.name.includes(searchValue) && !projectAlreadyExist;
    });

    setFilteredProjects(() => [...filtered]);
  }, [userProjects, workspaces, searchValue]);

  return {
    filteredProjects,
    searchValue,
    setSearchValue
  };
};

export default useFilteredProjects;
