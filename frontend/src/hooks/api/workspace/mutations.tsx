import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userKeys } from "../users/queries";
import { workspaceKeys } from "./queries";
import { TUpdateWorkspaceGroupRoleDTO } from "./types";

export const useAddGroupToWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupSlug,
      projectSlug,
      role
    }: {
      groupSlug: string;
      projectSlug: string;
      role?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.post(`/api/v2/workspace/${projectSlug}/groups/${groupSlug}`, {
        role
      });
      return groupMembership;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceGroupMemberships(projectSlug));
    }
  });
};

export const useUpdateGroupWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupSlug, projectSlug, roles }: TUpdateWorkspaceGroupRoleDTO) => {
      const {
        data: { groupMembership }
      } = await apiRequest.patch(`/api/v2/workspace/${projectSlug}/groups/${groupSlug}`, {
        roles
      });

      return groupMembership;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceGroupMemberships(projectSlug));
    }
  });
};

export const useDeleteGroupFromWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupSlug,
      projectSlug
    }: {
      groupSlug: string;
      projectSlug: string;
      username?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.delete(`/api/v2/workspace/${projectSlug}/groups/${groupSlug}`);
      return groupMembership;
    },
    onSuccess: (_, { projectSlug, username }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceGroupMemberships(projectSlug));

      if (username) {
        queryClient.invalidateQueries(userKeys.listUserGroupMemberships(username));
      }
    }
  });
};

export const useLeaveProject = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, { workspaceId: string }>({
    mutationFn: ({ workspaceId }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useMigrateProjectToV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, { workspaceId: string }>({
    mutationFn: ({ workspaceId }) => {
      return apiRequest.post(`/api/v1/workspace/${workspaceId}/migrate-v3`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};
