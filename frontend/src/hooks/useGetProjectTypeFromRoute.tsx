import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const useGetProjectTypeFromRoute = () => {
  const { location } = useRouterState();

  return useMemo(() => {
    const segments = location.pathname.split("/");

    let type: ProjectType | undefined;

    // location of project type can vary in router path, so we need to check all possible values
    segments.forEach((segment) => {
      if (Object.values(ProjectType).includes(segment as ProjectType))
        type = segment as ProjectType;
    });

    return type;
  }, [location]);
};
