import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { roleQueryKeys } from "./queries";
import { TCreateRoleDTO, TDeleteRoleDTO, TUpdateRoleDTO } from "./types";

export const useCreateRole = <T extends string | undefined>() => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: TCreateRoleDTO<T>) => apiRequest.post("/api/v1/roles", dto),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};

export const useUpdateRole = <T extends string | undefined>() => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...dto }: TUpdateRoleDTO<T>) => apiRequest.patch(`/api/v1/roles/${id}`, dto),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};

export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, id }: TDeleteRoleDTO) =>
      apiRequest.delete(`/api/v1/roles/${id}`, {
        data: { orgId }
      }),
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(roleQueryKeys.getRoles({ orgId, workspaceId }));
    }
  });
};
