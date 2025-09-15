import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { identityGroupKeys } from "./queries";
import { TIdentityGroup } from "./types";

export const useCreateIdentityGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      slug,
      role
    }: {
      name: string;
      slug: string;
      organizationId: string;
      role?: string;
    }) => {
      const { data: identityGroup } = await apiRequest.post<TIdentityGroup>(
        "/api/v1/identity-groups",
        {
          name,
          slug,
          role
        }
      );

      return identityGroup;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityGroups(organizationId)
      });
    }
  });
};

export const useUpdateIdentityGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      slug,
      role
    }: {
      id: string;
      name?: string;
      slug?: string;
      role?: string;
    }) => {
      const { data: identityGroup } = await apiRequest.patch<TIdentityGroup>(
        `/api/v1/identity-groups/${id}`,
        {
          name,
          slug,
          role
        }
      );

      return identityGroup;
    },
    onSuccess: ({ orgId, id: identityGroupId }) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgIdentityGroups(orgId) });
      queryClient.invalidateQueries({
        queryKey: identityGroupKeys.getIdentityGroupById(identityGroupId)
      });
    }
  });
};

export const useDeleteIdentityGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: identityGroup } = await apiRequest.delete<TIdentityGroup>(
        `/api/v1/identity-groups/${id}`
      );

      return identityGroup;
    },
    onSuccess: ({ orgId, id: identityGroupId }) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgIdentityGroups(orgId) });
      queryClient.invalidateQueries({
        queryKey: identityGroupKeys.getIdentityGroupById(identityGroupId)
      });
    }
  });
};

export const useAddIdentityToGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityGroupId,
      identityId
    }: {
      identityGroupId: string;
      identityId: string;
      slug: string;
    }) => {
      const { data } = await apiRequest.post<TIdentityGroup>(
        `/api/v1/identity-groups/${identityGroupId}/identities/${identityId}`
      );

      return data;
    },
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({
        queryKey: identityGroupKeys.forIdentityGroupIdentityMemberships(slug)
      });
    }
  });
};

export const useRemoveIdentityFromGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityId,
      identityGroupId
    }: {
      slug: string;
      identityId: string;
      identityGroupId: string;
    }) => {
      const { data } = await apiRequest.delete<TIdentityGroup>(
        `/api/v1/identity-groups/${identityGroupId}/identities/${identityId}`
      );

      return data;
    },
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({
        queryKey: identityGroupKeys.forIdentityGroupIdentityMemberships(slug)
      });
    }
  });
};
