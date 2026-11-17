import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { approvalPolicyQuery } from "../approvalPolicies/queries";
import { aiQueryKeys } from "./queries";
import { TOrgAiConfig, TUpdateOrgAiConfigDTO } from "./types";

export const useUpdateOrgAiConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TUpdateOrgAiConfigDTO) => {
      const { data } = await apiRequest.put<{ aiConfig: TOrgAiConfig | null }>(
        "/api/v1/organization/ai-config",
        dto
      );
      return data.aiConfig;
    },
    onSuccess: (aiConfig) => {
      queryClient.setQueryData(aiQueryKeys.orgConfig(), aiConfig);
      queryClient.invalidateQueries({ queryKey: approvalPolicyQuery.allKey() });
    }
  });
};
