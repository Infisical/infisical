import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";

export const useProject = () => {
  const params = useParams({
    strict: false
  });
  if (!params.projectId) {
    throw new Error("Missing project id");
  }

  const { data: currentProject } = useSuspenseQuery({
    queryKey: projectKeys.getProjectById(params.projectId),
    queryFn: () => fetchProjectById(params.projectId as string),
    staleTime: Infinity
  });

  return { currentProject, projectId: currentProject.id };
};
