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
    mutationFn: ({ namespaceName, ...data }: TCreateNamespaceRoleDTO) => {
      return apiRequest.post<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceName}/roles`,
        data
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useUpdateNamespaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, roleId, ...data }: TUpdateNamespaceRoleDTO) => {
      return apiRequest.patch<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceName}/roles/${roleId}`,
        data
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useDeleteNamespaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, roleId }: TDeleteNamespaceRoleDTO) => {
      return apiRequest.delete<{ role: TNamespaceRole }>(
        `/api/v1/namespaces/${namespaceName}/roles/${roleId}`
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.allKey()
      });
      // Also invalidate specific namespace role lists
      queryClient.invalidateQueries({
        queryKey: namespaceRolesQueryKeys.listKey({ namespaceName })
      });
    }
  });
};
