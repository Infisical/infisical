import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectGrantKeys } from "./queries";
import { TCreateProjectGrantDTO, TDeleteProjectGrantDTO, TProjectGrant } from "./types";

export const useCreateProjectGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateProjectGrantDTO) => {
      const { data } = await apiRequest.post<{ grant: TProjectGrant }>(
        "/api/v1/project-grants",
        dto
      );
      return data.grant;
    },
    onSuccess: (_, { sourceProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectGrantKeys.listByProject(sourceProjectId)
      });
    }
  });
};

export const useDeleteProjectGrant = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, sourceProjectId }: TDeleteProjectGrantDTO) => {
      const { data } = await apiRequest.delete<{ grant: TProjectGrant }>(
        `/api/v1/project-grants/${grantId}`,
        { params: { sourceProjectId } }
      );
      return data.grant;
    },
    onSuccess: (_, { sourceProjectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectGrantKeys.listByProject(sourceProjectId)
      });
    }
  });
};
