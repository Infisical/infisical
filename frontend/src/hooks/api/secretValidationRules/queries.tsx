import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListSecretValidationRulesDTO, TSecretValidationRule } from "./types";

export const secretValidationRuleKeys = {
  all: ["secretValidationRules"] as const,
  list: (projectId: string) => [...secretValidationRuleKeys.all, "list", projectId] as const
};

export const useListSecretValidationRules = (
  { projectId }: TListSecretValidationRulesDTO,
  options?: Omit<
    UseQueryOptions<
      TSecretValidationRule[],
      unknown,
      TSecretValidationRule[],
      ReturnType<typeof secretValidationRuleKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretValidationRuleKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ rules: TSecretValidationRule[] }>(
        `/api/v1/${projectId}/secret-validation-rules`
      );
      return data.rules;
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    ...options
  });
};
