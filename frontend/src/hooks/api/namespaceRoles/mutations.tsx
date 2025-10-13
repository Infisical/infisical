import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceRolesQueryKeys } from "./queries";
import {
  TCreateNamespaceRoleDTO,
  TDeleteNamespaceRoleDTO,
  TNamespaceRole,
  TUpdateNamespaceRoleDTO
} from "./types";

export const useCreateNamespaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, ...data }: TCreateNamespaceRoleDTO) => {
      return apiRequest.post<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceId}/roles`,
        data
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useUpdateNamespaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, roleId, ...data }: TUpdateNamespaceRoleDTO) => {
      return apiRequest.patch<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceId}/roles/${roleId}`,
        data
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useDeleteNamespaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, roleId }: TDeleteNamespaceRoleDTO) => {
      return apiRequest.delete<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceId}/roles/${roleId}`
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceId })
      });
    }
  });
};
