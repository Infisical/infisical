import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretValidationRuleKeys } from "./queries";
import {
  TCreateSecretValidationRuleDTO,
  TDeleteSecretValidationRuleDTO,
  TSecretValidationRule,
  TUpdateSecretValidationRuleDTO
} from "./types";

type TRuleResponse = { secretValidationRule: TSecretValidationRule };

export const useCreateSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, ...body }: TCreateSecretValidationRuleDTO) => {
      const { data } = await apiRequest.post<TRuleResponse>(
        `/api/v1/secret-validation-rules/${type}`,
        body
      );
      return data.secretValidationRule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};

export const useUpdateSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, ruleId, projectId: _, ...body }: TUpdateSecretValidationRuleDTO) => {
      const { data } = await apiRequest.patch<TRuleResponse>(
        `/api/v1/secret-validation-rules/${type}/${ruleId}`,
        body
      );
      return data.secretValidationRule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};

export const useDeleteSecretValidationRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, ruleId }: TDeleteSecretValidationRuleDTO) => {
      const { data } = await apiRequest.delete<TRuleResponse>(
        `/api/v1/secret-validation-rules/${type}/${ruleId}`
      );
      return data.secretValidationRule;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretValidationRuleKeys.list(projectId) });
    }
  });
};
