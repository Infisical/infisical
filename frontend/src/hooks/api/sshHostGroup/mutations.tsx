import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/query-keys";
import {
  TCreateSshHostGroupDTO,
  TDeleteSshHostGroupDTO,
  TSshHostGroup,
  TUpdateSshHostGroupDTO
} from "./types";

export const useCreateSshHostGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHostGroup, object, TCreateSshHostGroupDTO>({
    mutationFn: async (body) => {
      const { data: hostGroup } = await apiRequest.post("/api/v1/ssh/host-groups", body);
      return hostGroup;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceSshHostGroups(projectId)
      });
    }
  });
};

export const useUpdateSshHostGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHostGroup, object, TUpdateSshHostGroupDTO>({
    mutationFn: async ({ sshHostGroupId, ...body }) => {
      const { data: hostGroup } = await apiRequest.patch(
        `/api/v1/ssh/host-groups/${sshHostGroupId}`,
        body
      );
      return hostGroup;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceSshHostGroups(projectId)
      });
    }
  });
};

export const useDeleteSshHostGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHostGroup, object, TDeleteSshHostGroupDTO>({
    mutationFn: async ({ sshHostGroupId }) => {
      const { data: hostGroup } = await apiRequest.delete(
        `/api/v1/ssh/host-groups/${sshHostGroupId}`
      );
      return hostGroup;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceSshHostGroups(projectId)
      });
    }
  });
};
