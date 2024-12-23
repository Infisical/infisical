import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userSecretsKeys } from "./queries";
import { 
  CreateUserSecretDTO, 
  UpdateUserSecretDTO, 
  UserSecret 
} from "./types";

export const useCreateUserSecret = (organizationId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateUserSecretDTO) => {
      const { data: response } = await apiRequest.post<UserSecret>(
        `/api/v1/organizations/${organizationId}/user-secrets`,
        data
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userSecretsKeys.lists());
    }
  });
};

export const useUpdateUserSecret = (organizationId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateUserSecretDTO) => {
      const { data: response } = await apiRequest.patch<UserSecret>(
        `/api/v1/organizations/${organizationId}/user-secrets/${id}`,
        data
      );
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(userSecretsKeys.lists());
      queryClient.invalidateQueries(userSecretsKeys.detail(variables.id));
    }
  });
};

export const useDeleteUserSecret = (organizationId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiRequest.delete<{ success: boolean }>(
        `/api/v1/organizations/${organizationId}/user-secrets/${id}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userSecretsKeys.lists());
    }
  });
}; 