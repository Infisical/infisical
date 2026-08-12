import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentPolicyQueryKeys } from "./queries";
import { TAgentPolicy, TCreateAgentPolicyDTO, TUpdateAgentPolicyDTO } from "./types";

export const useCreateAgentPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateAgentPolicyDTO) => {
      const { data } = await apiRequest.post<{ agentPolicy: TAgentPolicy }>(
        "/api/v1/agent-policies",
        dto
      );
      return data.agentPolicy;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: agentPolicyQueryKeys.list(projectId) });
    }
  });
};

export const useUpdateAgentPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyId, projectId: _projectId, ...body }: TUpdateAgentPolicyDTO) => {
      const { data } = await apiRequest.patch<{ agentPolicy: TAgentPolicy }>(
        `/api/v1/agent-policies/${policyId}`,
        body
      );
      return data.agentPolicy;
    },
    onSuccess: (_, { projectId, policyId }) => {
      queryClient.invalidateQueries({ queryKey: agentPolicyQueryKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: agentPolicyQueryKeys.byId(policyId) });
    }
  });
};

export const useDeleteAgentPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId }: { policyId: string; projectId: string }) =>
      apiRequest.delete(`/api/v1/agent-policies/${policyId}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: agentPolicyQueryKeys.list(projectId) });
    }
  });
};
