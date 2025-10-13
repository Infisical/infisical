import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceIdentityQueryKeys } from "../namespaceIdentity/queries";
import { namespaceIdentityMembershipQueryKeys } from "./queries";
import {
  TCreateNamespaceIdentityMembershipDTO,
  TDeleteNamespaceIdentityMembershipDTO,
  TNamespaceIdentityMembership,
  TNamespaceIdentityMembershipRole,
  TUpdateNamespaceIdentityMembershipDTO
} from "./types";

export const useCreateNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, identityId, roles }: TCreateNamespaceIdentityMembershipDTO) => {
      return apiRequest.post<{ identityMembership: TNamespaceIdentityMembership }>(
        `/api/v1/namespaces/${namespaceId}/identity-memberships/${identityId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useUpdateNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, identityId, roles }: TUpdateNamespaceIdentityMembershipDTO) => {
      return apiRequest.patch<{ roles: TNamespaceIdentityMembershipRole[] }>(
        `/api/v1/namespaces/${namespaceId}/identity-memberships/${identityId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.detailKey(namespaceId, identityId)
      });
      // Also invalidate specific namespace identity membership lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useDeleteNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, identityId }: TDeleteNamespaceIdentityMembershipDTO) => {
      return apiRequest.delete<{ identityMembership: TNamespaceIdentityMembership }>(
        `/api/v1/namespaces/${namespaceId}/identity-memberships/${identityId}`
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};
