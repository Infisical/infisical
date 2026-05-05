import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { groupMembershipsBase } from "@app/hooks/api/certManagerAccess";

import { groupKeys } from "../groups/queries";
import { TGroupMembership } from "../groups/types";
import { userKeys } from "../users/query-keys";
import { projectKeys } from "./query-keys";
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
      projectType,
      role
    }: {
      groupId: string;
      projectId: string;
      projectType?: string;
      role?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.post(`${groupMembershipsBase(projectType, projectId)}/${groupId}`, {
        role
      });

      return groupMembership;
    },
    onSuccess: (_, { projectId, groupId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });
      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupProjects(groupId) });
    }
  });
};

export const useUpdateGroupWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      projectId,
      projectType,
      roles
    }: TUpdateWorkspaceGroupRoleDTO) => {
      const { data } = await apiRequest.patch<{ roles: TGroupMembership["roles"] }>(
        `${groupMembershipsBase(projectType, projectId)}/${groupId}`,
        { roles }
      );

      return data;
    },
    onSuccess: (_, { projectId, groupId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMembershipDetails(projectId, groupId)
      });
    }
  });
};

export const useDeleteGroupFromWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      projectId,
      projectType
    }: {
      groupId: string;
      projectId: string;
      projectType?: string;
      username?: string;
    }) => {
      const {
        data: { groupMembership }
      } = await apiRequest.delete(`${groupMembershipsBase(projectType, projectId)}/${groupId}`);
      return groupMembership;
    },
    onSuccess: (_, { projectId, username, groupId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectGroupMemberships(projectId)
      });

      queryClient.invalidateQueries({ queryKey: groupKeys.forGroupProjects(groupId) });

      if (username) {
        queryClient.invalidateQueries({ queryKey: userKeys.listUserGroupMemberships(username) });
      }
    }
  });
};

export const useLeaveProject = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { projectId: string }>({
    mutationFn: ({ projectId }) => {
      return apiRequest.delete(`/api/v1/projects/${projectId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getAllUserProjects() });
    }
  });
};

export const useMigrateProjectToV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { projectId: string }>({
    mutationFn: ({ projectId }) => {
      return apiRequest.post(`/api/v1/projects/${projectId}/migrate-v3`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useRequestProjectAccess = () => {
  return useMutation<object, object, { projectId: string; comment: string }>({
    mutationFn: ({ projectId, comment }) => {
      return apiRequest.post(`/api/v1/projects/${projectId}/project-access`, {
        comment
      });
    }
  });
};

export const useUpdateProjectSshConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<TProjectSshConfig, object, TUpdateProjectSshConfigDTO>({
    mutationFn: ({ projectId, defaultUserSshCaId, defaultHostSshCaId }) => {
      return apiRequest.patch(`/api/v1/projects/${projectId}/ssh-config`, {
        defaultUserSshCaId,
        defaultHostSshCaId
      });
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshConfig(projectId)
      });
    }
  });
};
