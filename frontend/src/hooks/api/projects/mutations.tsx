import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { groupMembershipsBase } from "@app/hooks/api/certManagerAccess";

import { groupKeys } from "../groups/queries";
import { TGroupMembership } from "../groups/types";
import { pkiApplicationKeys } from "../pkiApplications/queries";
import { secretInsightsKeys } from "../secretInsights/queries";
import { userKeys } from "../users/query-keys";
import { projectKeys } from "./query-keys";
import {
  TProjectSshConfig,
  TUpdateProjectSshConfigDTO,
  TUpdateWorkspaceGroupRoleDTO
} from "./types";

const invalidateAuditForProject = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string
) => {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length < 2) return false;
      if (key[1] !== "membership-permission-audit" && key[1] !== "identity-permission-audit")
        return false;
      const params = key[0] as { projectId?: string } | undefined;
      return params?.projectId === projectId;
    }
  });
};

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
      invalidateAuditForProject(queryClient, projectId);
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
      invalidateAuditForProject(queryClient, projectId);
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

      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
      invalidateAuditForProject(queryClient, projectId);
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
  const queryClient = useQueryClient();
  return useMutation<object, object, { projectId: string; comment: string }>({
    mutationFn: ({ projectId, comment }) => {
      return apiRequest.post(`/api/v1/projects/${projectId}/project-access`, {
        comment
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getMyPendingProjectAccessRequests()
      });
    }
  });
};

export const useEnableSecretBlindIndex = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, object, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data } = await apiRequest.post<{ message: string }>(
        `/api/v1/projects/${projectId}/secret-blind-index`
      );
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.secretsDuplication({ projectId })
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
