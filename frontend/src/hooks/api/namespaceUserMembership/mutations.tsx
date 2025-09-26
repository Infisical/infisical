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
    mutationFn: ({ namespaceName, membershipId, roles }: TUpdateNamespaceMembershipDTO) => {
      return apiRequest.patch<{ roles: TNamespaceMembershipRole[] }>(
        `/api/v1/namespaces/${namespaceName}/memberships/${membershipId}`,
        { roles }
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useDeleteNamespaceUserMembership = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, membershipId }: TDeleteNamespaceMembershipDTO) => {
      return apiRequest.delete<{ membership: TNamespaceMembership }>(
        `/api/v1/namespaces/${namespaceName}/memberships/${membershipId}`
      );
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useAddUsersToNamespace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, usernames, roleSlugs }: TAddUsersToNamespaceDTO) => {
      return apiRequest.post<{
        message: string;
        completeInviteLinks?: Array<{ email: string; link: string }>;
      }>(`/api/v1/namespaces/${namespaceName}/memberships`, {
        usernames,
        roleSlugs
      });
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.allKey()
      });
      // Also invalidate specific namespace membership lists
      queryClient.invalidateQueries({
        queryKey: namespaceUserMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};
