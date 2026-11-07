import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { projectKeys } from "@app/hooks/api/projects/query-keys";

export const useProjectById = (projectId: string) =>
  useQuery({
    queryKey: projectKeys.getProjectById(projectId),
    queryFn: () => fetchProjectById(projectId),
    enabled: Boolean(projectId),
    retry: (failureCount, error) =>
      !(error instanceof AxiosError && [403, 404].includes(error.response?.status ?? 0)) &&
      failureCount < 1
  });
