import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";

import { useOrganization } from "../OrganizationContext";

export const useProject = () => {
  const params = useParams({
    strict: false
  });

  const { currentOrg } = useOrganization();

  const projectId = params.projectId ?? currentOrg.pamProjectId;

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
