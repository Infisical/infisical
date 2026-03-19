import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretValidationRuleKeys } from "./queries";
import {
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TSecretValidationRule,
  TUpdateSecretValidationRuleDTO
} from "./types";

export const useCreateSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: TCreateSecretValidationRuleDTO) => {
      const { data } = await apiRequest.post<{ rule: TSecretValidationRule }>(
        `/api/v1/${projectId}/secret-validation-rules`,
        body
      );
      return data.rule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};

export const useUpdateSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ruleId, ...body }: TUpdateSecretValidationRuleDTO) => {
      const { data } = await apiRequest.patch<{ rule: TSecretValidationRule }>(
        `/api/v1/${projectId}/secret-validation-rules/${ruleId}`,
        body
      );
      return data.rule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};

export const useDeleteSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ruleId }: TDeleteSecretValidationRuleDTO) => {
      const { data } = await apiRequest.delete<{ rule: TSecretValidationRule }>(
        `/api/v1/${projectId}/secret-validation-rules/${ruleId}`
      );
      return data.rule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};
