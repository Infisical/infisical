import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const useGetProjectTypeFromRoute = () => {
  const { location } = useRouterState();

  const segment = location.pathname.split("/")[2];

  if (!Object.values(ProjectType).includes(segment as ProjectType)) return undefined;

  return segment as ProjectType;
};
