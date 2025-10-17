import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceUserMembershipQueryKeys } from "./queries";
import {
  TAddUsersToNamespaceDTO,
  TDeleteNamespaceMembershipDTO,
  TNamespaceMembership,
  TNamespaceMembershipRole,
  TUpdateNamespaceMembershipDTO
} from "./types";

export const useUpdateNamespaceUserMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, userId, roles }: TUpdateNamespaceMembershipDTO) => {
      return apiRequest.patch<{ roles: TNamespaceMembershipRole[] }>(
        `/api/v1/namespaces/${namespaceId}/memberships/${userId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useDeleteNamespaceUserMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, userId }: TDeleteNamespaceMembershipDTO) => {
      return apiRequest.delete<{ membership: TNamespaceMembership }>(
        `/api/v1/namespaces/${namespaceId}/memberships/${userId}`
      );
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};

export const useAddUsersToNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceId, usernames, roles }: TAddUsersToNamespaceDTO) => {
      return apiRequest.post<{
        message: string;
        completeInviteLinks?: Array<{ email: string; link: string }>;
      }>(`/api/v1/namespaces/${namespaceId}/memberships`, {
        usernames,
        roles
      });
    },
    onSuccess: (_, { namespaceId }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceId })
      });
    }
  });
};
