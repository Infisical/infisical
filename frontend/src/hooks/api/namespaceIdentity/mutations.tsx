import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceIdentityMembershipQueryKeys } from "../namespaceIdentityMembership/queries";
import { namespaceIdentityQueryKeys } from "./queries";
import {
  TCreateNamespaceIdentityDTO,
  TDeleteNamespaceIdentityDTO,
  TNamespaceIdentity,
  TUpdateNamespaceIdentityDTO
} from "./types";

export const useCreateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, ...data }: TCreateNamespaceIdentityDTO) => {
      return apiRequest.post<{
        identity: TNamespaceIdentity & {
          metadata: Array<{ id: string; key: string; value: string }>;
        };
      }>(`/api/v1/namespaces/${namespaceId}/identities`, data);
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceId })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useUpdateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, identityId, ...data }: TUpdateNamespaceIdentityDTO) => {
      return apiRequest.patch<{
        identity: TNamespaceIdentity & {
          metadata: Array<{ id: string; key: string; value: string }>;
        };
      }>(`/api/v1/namespaces/${namespaceId}/identities/${identityId}`, data);
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceId })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useDeleteNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, identityId }: TDeleteNamespaceIdentityDTO) => {
      return apiRequest.delete<{ identity: TNamespaceIdentity }>(
        `/api/v1/namespaces/${namespaceId}/identities/${identityId}`
      );
    },
    onSuccess: (_, { namespaceId }) => {
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceId })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};
