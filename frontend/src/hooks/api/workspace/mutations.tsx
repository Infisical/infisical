import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userKeys } from "../users/query-keys";
import { workspaceKeys } from "./query-keys";
import {
  TProjectSshConfig,
  TUpdateProjectSshConfigDTO,
  TUpdateWorkspaceGroupRoleDTO
} from "./types";

export const useAddGroupToWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      projectId,
      role
    }: {
      groupId: string;
      projectId: string;
      role?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.post(`/api/v2/workspace/${projectId}/groups/${groupId}`, {
        role
      });

      return groupMembership;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceGroupMemberships(projectId)
      });
    }
  });
};

export const useUpdateGroupWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, projectId, roles }: TUpdateWorkspaceGroupRoleDTO) => {
      const {
        data: { groupMembership }
      } = await apiRequest.patch(`/api/v2/workspace/${projectId}/groups/${groupId}`, {
        roles
      });

      return groupMembership;
    },
    onSuccess: (_, { projectId, groupId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceGroupMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceGroupMembershipDetails(projectId, groupId)
      });
    }
  });
};

export const useDeleteGroupFromWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      projectId
    }: {
      groupId: string;
      projectId: string;
      username?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.delete(`/api/v2/workspace/${projectId}/groups/${groupId}`);
      return groupMembership;
    },
    onSuccess: (_, { projectId, username }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceGroupMemberships(projectId)
      });

      if (username) {
        queryClient.invalidateQueries({ queryKey: userKeys.listUserGroupMemberships(username) });
      }
    }
  });
};

export const useLeaveProject = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { workspaceId: string }>({
    mutationFn: ({ workspaceId }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useMigrateProjectToV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { workspaceId: string }>({
    mutationFn: ({ workspaceId }) => {
      return apiRequest.post(`/api/v1/workspace/${workspaceId}/migrate-v3`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useRequestProjectAccess = () => {
  return useMutation<object, object, { projectId: string; comment: string }>({
    mutationFn: ({ projectId, comment }) => {
      return apiRequest.post(`/api/v1/workspace/${projectId}/project-access`, {
        comment
      });
    }
  });
};

export const useUpdateProjectSshConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<TProjectSshConfig, object, TUpdateProjectSshConfigDTO>({
    mutationFn: ({ projectId, defaultUserSshCaId, defaultHostSshCaId }) => {
      return apiRequest.patch(`/api/v1/workspace/${projectId}/ssh-config`, {
        defaultUserSshCaId,
        defaultHostSshCaId
      });
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getProjectSshConfig(projectId)
      });
    }
  });
};
