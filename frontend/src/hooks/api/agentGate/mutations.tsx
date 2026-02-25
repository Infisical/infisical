import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentGateKeys } from "./queries";
import { TAgentGatePolicy, TUpdateAgentPolicyDTO } from "./types";

export const useUpdateAgentPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGatePolicy, object, TUpdateAgentPolicyDTO>({
    mutationFn: async ({ agentId, projectId, selfPolicies, inboundPolicies }) => {
      const { data } = await apiRequest.put<TAgentGatePolicy>(
        `/api/v1/agentgate/agents/${agentId}/policy`,
        { selfPolicies, inboundPolicies },
        { params: { projectId } }
      );
      return data;
    },
    onSuccess: (_, { projectId, agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentGateKeys.policies({ projectId })
      });
      queryClient.invalidateQueries({
        queryKey: agentGateKeys.agentPolicy({ agentId, projectId })
      });
    }
  });
};
