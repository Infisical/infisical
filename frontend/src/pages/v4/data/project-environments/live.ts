import { useQueryClient } from "@tanstack/react-query";

import {
  useCreateWsEnvironment,
  useDeleteWsEnvironment,
  useRestoreEnvironment,
  useUpdateWsEnvironment
} from "@app/hooks/api/projects/queries";
import { projectKeys } from "@app/hooks/api/projects/query-keys";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import { useProjectById } from "../projectQuery";
import type { ProjectEnvironmentsAdapter } from "./contract";

export const projectEnvironmentsLive: ProjectEnvironmentsAdapter = {
  useProject: useProjectById,
  useEnvironmentLimit: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data?.environmentLimit, isPending, error };
  },
  useCreateEnvironment: useCreateWsEnvironment,
  useUpdateEnvironment: () => {
    const queryClient = useQueryClient();
    const { mutateAsync, isPending } = useUpdateWsEnvironment();
    return {
      isPending,
      mutateAsync: (variables) =>
        mutateAsync(variables).catch((error: unknown) => {
          queryClient.invalidateQueries({
            queryKey: projectKeys.getProjectById(variables.projectId)
          });
          throw error;
        })
    };
  },
  useDeleteEnvironment: useDeleteWsEnvironment,
  useRestoreEnvironment
};
