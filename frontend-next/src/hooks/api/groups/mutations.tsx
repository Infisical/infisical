import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { userKeys } from "../users/query-keys";
import { groupKeys } from "./queries";
import { TGroup } from "./types";

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
      queryClient.invalidateQueries(organizationKeys.getOrgGroups(organizationId));
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
    }) => {
      const { data: group } = await apiRequest.patch<TGroup>(`/api/v1/groups/${id}`, {
        name,
        slug,
        role
      });

      return group;
    },
    onSuccess: ({ orgId, id: groupId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgGroups(orgId));
      queryClient.invalidateQueries(groupKeys.getGroupById(groupId));
    }
  });
};

export const useDeleteGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: group } = await apiRequest.delete<TGroup>(`/api/v1/groups/${id}`);

      return group;
    },
    onSuccess: ({ orgId, id: groupId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgGroups(orgId));
      queryClient.invalidateQueries(groupKeys.getGroupById(groupId));
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
      queryClient.invalidateQueries(groupKeys.forGroupUserMemberships(slug));
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
      queryClient.invalidateQueries(groupKeys.forGroupUserMemberships(slug));
      queryClient.invalidateQueries(userKeys.listUserGroupMemberships(username));
    }
  });
};
