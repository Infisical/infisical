import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespacesQueryKeys } from "./queries";
import { TCreateNamespaceDTO, TUpdateNamespaceDTO, TDeleteNamespaceDTO, TNamespace } from "./types";

export const useCreateNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TCreateNamespaceDTO) => {
      return apiRequest.post<{ namespace: TNamespace }>("/api/v1/namespaces", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: namespacesQueryKeys.allKey()
      });
    }
  });
};

export const useUpdateNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...data }: TUpdateNamespaceDTO) => {
      return apiRequest.patch<{ namespace: TNamespace }>(`/api/v1/namespaces/${name}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: namespacesQueryKeys.allKey()
      });
    }
  });
};

export const useDeleteNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: TDeleteNamespaceDTO) => {
      return apiRequest.delete<{ namespace: TNamespace }>(`/api/v1/namespaces/${name}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: namespacesQueryKeys.allKey()
      });
    }
  });
};