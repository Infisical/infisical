import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { namespaceIdentityQueryKeys } from "./queries";
import {
  TCreateNamespaceIdentityDTO,
  TUpdateNamespaceIdentityDTO,
  TDeleteNamespaceIdentityDTO,
  TNamespaceIdentity
} from "./types";
import { namespaceIdentityMembershipQueryKeys } from "../namespaceIdentityMembership/queries";

export const useCreateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, ...data }: TCreateNamespaceIdentityDTO) => {
      return apiRequest.post<{
        identity: TNamespaceIdentity & {
          metadata: Array<{ id: string; key: string; value: string }>;
        };
      }>(`/api/v1/namespaces/${namespaceName}/identities`, data);
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceName })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useUpdateNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, identityId, ...data }: TUpdateNamespaceIdentityDTO) => {
      return apiRequest.patch<{
        identity: TNamespaceIdentity & {
          metadata: Array<{ id: string; key: string; value: string }>;
        };
      }>(`/api/v1/namespaces/${namespaceName}/identities/${identityId}`, data);
    },
    onSuccess: (_, { namespaceName }) => {
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.allKey()
      });
      // Also invalidate specific namespace identity lists and details
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceName })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};

export const useDeleteNamespaceIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ namespaceName, identityId }: TDeleteNamespaceIdentityDTO) => {
      return apiRequest.delete<{ identity: TNamespaceIdentity }>(
        `/api/v1/namespaces/${namespaceName}/identities/${identityId}`
      );
    },
    onSuccess: (_, { namespaceName }) => {
      // Also invalidate specific namespace identity lists
      queryClient.invalidateQueries({
        queryKey: namespaceIdentityQueryKeys.listKey({ namespaceName })
      });

      queryClient.invalidateQueries({
        queryKey: namespaceIdentityMembershipQueryKeys.listKey({ namespaceName })
      });
    }
  });
};
