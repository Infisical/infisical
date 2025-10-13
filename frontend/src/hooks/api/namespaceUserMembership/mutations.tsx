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
    mutationFn: ({ namespaceId, membershipId, roles }: TUpdateNamespaceMembershipDTO) => {
      return apiRequest.patch<{ roles: TNamespaceMembershipRole[] }>(
        `/api/v1/namespaces/${namespaceId}/memberships/${membershipId}`,
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
    mutationFn: ({ namespaceId, membershipId }: TDeleteNamespaceMembershipDTO) => {
      return apiRequest.delete<{ membership: TNamespaceMembership }>(
        `/api/v1/namespaces/${namespaceId}/memberships/${membershipId}`
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
    mutationFn: ({ namespaceId, usernames, roleSlugs }: TAddUsersToNamespaceDTO) => {
      return apiRequest.post<{
        message: string;
        completeInviteLinks?: Array<{ email: string; link: string }>;
      }>(`/api/v1/namespaces/${namespaceId}/memberships`, {
        usernames,
        roleSlugs
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
