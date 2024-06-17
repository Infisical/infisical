import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

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
    mutationFn: async ({ groupSlug, projectSlug }: { groupSlug: string; projectSlug: string }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.delete(`/api/v2/workspace/${projectSlug}/groups/${groupSlug}`);
      return groupMembership;
    },
    onSuccess: (_, { projectSlug }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceGroupMemberships(projectSlug));
    }
  });
};

export const useLeaveProject = () => {
  return useMutation<{}, {}, { workspaceId: string; organizationId: string }>({
    mutationFn: ({ workspaceId }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceId}/leave`);
    },
    onSuccess: (_, { organizationId }) => {
      // Invalidating the query here will cause a permission error, so we won't invalidate any queries here. Instead after leaving the workspace, we will redirect the user to the organization overview page.
      window.location.href = `/org/${organizationId}/overview`;
    }
  });
};
