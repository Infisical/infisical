import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespacesQueryKeys } from "./queries";
import { TCreateNamespaceDTO, TDeleteNamespaceDTO, TNamespace, TUpdateNamespaceDTO } from "./types";

export const useCreateNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TCreateNamespaceDTO) => {
      return apiRequest
        .post<{ namespace: TNamespace }>("/api/v1/namespaces", data)
        .then((el) => el.data);
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
    mutationFn: ({ namespaceId, ...data }: TUpdateNamespaceDTO) => {
      return apiRequest.patch<{ namespace: TNamespace }>(`/api/v1/namespaces/${namespaceId}`, data);
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
    mutationFn: ({ namespaceId }: TDeleteNamespaceDTO) => {
      return apiRequest.delete<{ namespace: TNamespace }>(`/api/v1/namespaces/${namespaceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: namespacesQueryKeys.allKey()
      });
    }
  });
};
