import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const useGetProjectTypeFromRoute = () => {
  const { location } = useRouterState();

  return useMemo(() => {
    const segments = location.pathname.split("/");
    const type = segments?.[2];
    if (!type) return ProjectType.SecretManager;

    // second element would be /projects/$projectId/<type>
    return Object.values(ProjectType).find((el) => el === type) || ProjectType.SecretManager;
  }, [location]);
};
