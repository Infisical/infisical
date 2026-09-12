import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { useImplicitProjectId } from "@app/hooks/useImplicitProjectId";

export const useProject = () => {
  const params = useParams({
    strict: false
  });

  const implicitProjectId = useImplicitProjectId();

  const projectId = params.projectId ?? implicitProjectId;

  if (!projectId) {
    throw new Error("Missing project id");
  }

  const { data: currentProject } = useSuspenseQuery({
    queryKey: projectKeys.getProjectById(projectId),
    queryFn: () => fetchProjectById(projectId),
    staleTime: Infinity
  });

  return { currentProject, projectId: currentProject.id };
};
