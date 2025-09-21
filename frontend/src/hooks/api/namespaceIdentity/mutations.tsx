import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceIdentityQueryKeys } from "./queries";
import {
  TNamespaceIdentityMembership,
  TCreateNamespaceIdentityDTO,
  TUpdateNamespaceIdentityDTO,
  TDeleteNamespaceIdentityDTO,
  TNamespaceIdentity
} from "./types";

export const useCreateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceSlug, ...data }: TCreateNamespaceIdentityDTO) => {
      return apiRequest.post<{ identity: TNamespaceIdentity & { metadata: Array<{ id: string; key: string; value: string }> } }>(
        `/api/v1/namespaces/${namespaceSlug}/identities`,
        data
      );
    },
    onSuccess: (_, { namespaceSlug }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceSlug })
      });
    }
  });
};

export const useUpdateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceSlug, identityId, ...data }: TUpdateNamespaceIdentityDTO) => {
      return apiRequest.patch<{ identity: TNamespaceIdentity & { metadata: Array<{ id: string; key: string; value: string }> } }>(
        `/api/v1/namespaces/${namespaceSlug}/identities/${identityId}`,
        data
      );
    },
    onSuccess: (_, { namespaceSlug }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceSlug })
      });
    }
  });
};

export const useDeleteNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceSlug, identityId }: TDeleteNamespaceIdentityDTO) => {
      return apiRequest.delete<{ identity: TNamespaceIdentity }>(
        `/api/v1/namespaces/${namespaceSlug}/identities/${identityId}`
      );
    },
    onSuccess: (_, { namespaceSlug }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceSlug })
      });
    }
  });
};