import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { userKeys } from "../users/query-keys";
import { groupKeys } from "./queries";
import { TGroup, TGroupMachineIdentity } from "./types";

export const useCreateGroup = () => {
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
      const { data: group } = await apiRequest.post<TGroup>("/api/v1/groups", {
        name,
        slug,
        role
      });

      return group;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(organizationId) });
    }
  });
};

export const useUpdateGroup = () => {
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
      /** Pass to invalidate this org's group list (e.g. current org when editing role in sub-org) */
      organizationId?: string;
    }) => {
      const { data: group } = await apiRequest.patch<TGroup>(`/api/v1/groups/${id}`, {
        name,
        slug,
        role
      });

      return group;
    },
    onSuccess: (group, variables) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(group.orgId) });
      if (variables.organizationId && variables.organizationId !== group.orgId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgGroups(variables.organizationId)
        });
      }
      queryClient.invalidateQueries({ queryKey: groupKeys.getGroupById(group.id) });
    }
  });
};

export const useDeleteGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id
    }: {
      id: string;
      /** Pass to invalidate this org's group list (e.g. current org when unlinking in sub-org) */
      organizationId?: string;
    }) => {
      const { data: group } = await apiRequest.delete<TGroup>(`/api/v1/groups/${id}`);

      return group;
    },
    onSuccess: (group, variables) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getOrgGroups(group.orgId) });
      if (variables.organizationId && variables.organizationId !== group.orgId) {
        queryClient.invalidateQueries({
          queryKey: organizationKeys.getOrgGroups(variables.organizationId)
        });
      }
      queryClient.invalidateQueries({ queryKey: groupKeys.getGroupById(group.id) });
    }
  });
};

export const useAddUserToGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      username
    }: {
      groupId: string;
      username: string;
      slug: string;
    }) => {
      const { data } = await apiRequest.post<TGroup>(`/api/v1/groups/${groupId}/users/${username}`);

      return data;
    },
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupUserMemberships(slug) });
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupMembers(slug) });
    }
  });
};

export const useRemoveUserFromGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      username,
      groupId
    }: {
      slug: string;
      username: string;
      groupId: string;
    }) => {
      const { data } = await apiRequest.delete<TGroup>(
        `/api/v1/groups/${groupId}/users/${username}`
      );

      return data;
    },
    onSuccess: (_, { slug, username }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupUserMemberships(slug) });
      queryClient.invalidateQueries({ queryKey: userKeys.listUserGroupMemberships(username) });
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupMembers(slug) });
    }
  });
};

export const useAddIdentityToGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      identityId
    }: {
      groupId: string;
      identityId: string;
      slug: string;
    }) => {
      const { data } = await apiRequest.post<Pick<TGroupMachineIdentity, "id" | "name">>(
        `/api/v1/groups/${groupId}/machine-identities/${identityId}`
      );

      return data;
    },
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupIdentitiesMemberships(slug) });
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupMembers(slug) });
    }
  });
};

export const useRemoveIdentityFromGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      identityId
    }: {
      groupId: string;
      identityId: string;
      slug: string;
    }) => {
      const { data } = await apiRequest.delete<Pick<TGroupMachineIdentity, "id" | "name">>(
        `/api/v1/groups/${groupId}/machine-identities/${identityId}`
      );

      return data;
    },
    onSuccess: (_, { slug }) => {
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupIdentitiesMemberships(slug) });
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupMembers(slug) });
    }
  });
};
