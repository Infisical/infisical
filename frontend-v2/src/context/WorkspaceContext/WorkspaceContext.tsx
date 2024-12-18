import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { workspaceKeys } from "@app/hooks/api";
import { fetchWorkspaceById } from "@app/hooks/api/workspace/queries";

export const useWorkspace = () => {
  const params = useParams({
    strict: false
  });
  if (!params.projectId) {
    throw new Error("Missing project id");
  }

  const { data: currentWorkspace } = useSuspenseQuery({
    queryKey: workspaceKeys.getWorkspaceById(params.projectId),
    queryFn: () => fetchWorkspaceById(params.projectId as string),
    staleTime: Infinity
  });

  return { currentWorkspace };
};
