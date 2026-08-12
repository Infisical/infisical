import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userPolicyQueryKeys } from "./queries";
import { TCreateUserPolicyDTO, TUpdateUserPolicyDTO, TUserPolicy } from "./types";

export const useCreateUserPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateUserPolicyDTO) => {
      const { data } = await apiRequest.post<{ userPolicy: TUserPolicy }>(
        "/api/v1/user-policies",
        dto
      );
      return data.userPolicy;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: userPolicyQueryKeys.list(projectId) });
    }
  });
};

export const useUpdateUserPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyId, projectId: _projectId, ...body }: TUpdateUserPolicyDTO) => {
      const { data } = await apiRequest.patch<{ userPolicy: TUserPolicy }>(
        `/api/v1/user-policies/${policyId}`,
        body
      );
      return data.userPolicy;
    },
    onSuccess: (_, { projectId, policyId }) => {
      queryClient.invalidateQueries({ queryKey: userPolicyQueryKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: userPolicyQueryKeys.byId(policyId) });
    }
  });
};

export const useDeleteUserPolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId }: { policyId: string; projectId: string }) =>
      apiRequest.delete(`/api/v1/user-policies/${policyId}`),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: userPolicyQueryKeys.list(projectId) });
    }
  });
};
