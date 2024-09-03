import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workflowIntegrationKeys } from "./queries";
import { TDeleteSlackIntegrationDTO, TUpdateSlackIntegrationDTO } from "./types";

export const useUpdateSlackIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSlackIntegrationDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch(`/api/v1/workflow-integrations/slack/${dto.id}`, dto);

      return data;
    },
    onSuccess: (_, { orgId, id }) => {
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackWorkflowIntegration(id));
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackWorkflowIntegrations(orgId));
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
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackWorkflowIntegration(id));
      queryClient.invalidateQueries(workflowIntegrationKeys.getSlackWorkflowIntegrations(orgId));
    }
  });
};
