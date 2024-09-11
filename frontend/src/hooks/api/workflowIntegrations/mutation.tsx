import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { workflowIntegrationKeys } from "./queries";
import {
  TDeleteSlackIntegrationDTO,
  TUpdateProjectSlackConfigDTO,
  TUpdateSlackIntegrationDTO
} from "./types";

export const useUpdateSlackIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSlackIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(`/api/v1/workflow-integrations/slack/${dto.id}`, dto);

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackIntegration(id));
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackIntegrations(orgId));
    }
  });
};

export const useDeleteSlackIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSlackIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete(`/api/v1/workflow-integrations/slack/${dto.id}`);

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackIntegration(id));
      queryClient.invalidateQueries(workflowIntegrationKeys.getIntegrations(orgId));
    }
  });
};

export const useUpdateProjectSlackConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateProjectSlackConfigDTO) => {
      const { data } = await apiRequest.put(
        `/api/v1/workspace/${dto.workspaceId}/slack-config`,
        dto
      );

      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceSlackConfig(workspaceId));
    }
  });
};
