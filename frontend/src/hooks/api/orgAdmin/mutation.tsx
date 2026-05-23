import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { projectKeys } from "@app/hooks/api/projects/query-keys";

import { TOrgAdminAccessProjectDTO } from "./types";

export const useOrgAdminAccessProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId }: TOrgAdminAccessProjectDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.allProjectQueries() });
    }
  });
};
