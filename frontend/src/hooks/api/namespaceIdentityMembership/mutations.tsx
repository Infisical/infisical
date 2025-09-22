import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceIdentityMembershipQueryKeys } from "./queries";
import {
  TNamespaceIdentityMembership,
  TNamespaceIdentityMembershipRole,
  TCreateNamespaceIdentityMembershipDTO,
  TUpdateNamespaceIdentityMembershipDTO,
  TDeleteNamespaceIdentityMembershipDTO
} from "./types";
import { namespaceIdentityQueryKeys } from "../namespaceIdentity/queries";

export const useCreateNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, identityId, roles }: TCreateNamespaceIdentityMembershipDTO) => {
      return apiRequest.post<{ identityMembership: TNamespaceIdentityMembership }>(
        `/api/v1/namespaces/${namespaceName}/identity-memberships/${identityId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useUpdateNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, identityId, roles }: TUpdateNamespaceIdentityMembershipDTO) => {
      return apiRequest.patch<{ roles: TNamespaceIdentityMembershipRole[] }>(
        `/api/v1/namespaces/${namespaceName}/identity-memberships/${identityId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceName, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.detailKey(namespaceName, identityId)
      });
      // Also invalidate specific namespace identity membership lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useDeleteNamespaceIdentityMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, identityId }: TDeleteNamespaceIdentityMembershipDTO) => {
      return apiRequest.delete<{ identityMembership: TNamespaceIdentityMembership }>(
        `/api/v1/namespaces/${namespaceName}/identity-memberships/${identityId}`
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};
