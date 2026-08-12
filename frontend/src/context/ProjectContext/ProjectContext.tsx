import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { endpointKeys, fetchEndpointProjectId } from "@app/hooks/api/endpoint";
import { fetchProjectById } from "@app/hooks/api/projects/queries";

import { useOrganization } from "../OrganizationContext";

export const useProject = () => {
  const params = useParams({
    strict: false
  });
  const { pathname } = useLocation();

  const { currentOrg } = useOrganization();

  // Endpoint is org-scoped like PAM but has no dedicated field on Organization, so its project id
  // is resolved from its own query key instead (populated by the endpoint layout's beforeLoad).
  const isEndpointRoute = pathname.includes("/endpoint/");
  const { data: endpointProjectId } = useQuery({
    queryKey: endpointKeys.project(),
    queryFn: fetchEndpointProjectId,
    enabled: isEndpointRoute,
    staleTime: Infinity
  });

  const projectId =
    params.projectId ?? (isEndpointRoute ? endpointProjectId : currentOrg.pamProjectId);

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
