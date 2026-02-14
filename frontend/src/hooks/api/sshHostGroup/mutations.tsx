import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects/query-keys";
import { sshHostGroupKeys } from "./queries";
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
    onSuccess: ({ projectId, id }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshHostGroups(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: sshHostGroupKeys.getSshHostGroupById(id)
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
    onSuccess: ({ projectId }, { sshHostGroupId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshHostGroups(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshHosts(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: sshHostGroupKeys.getSshHostGroupById(sshHostGroupId)
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
    onSuccess: ({ projectId }, { sshHostGroupId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshHostGroups(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectSshHosts(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: sshHostGroupKeys.getSshHostGroupById(sshHostGroupId)
      });
    }
  });
};

export const useAddHostToSshHostGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<void, object, { sshHostGroupId: string; sshHostId: string }>({
    mutationFn: async ({ sshHostGroupId, sshHostId }) => {
      await apiRequest.post(`/api/v1/ssh/host-groups/${sshHostGroupId}/hosts/${sshHostId}`, {});
    },
    onSuccess: (_, { sshHostGroupId }) => {
      queryClient.invalidateQueries({
        queryKey: sshHostGroupKeys.forSshHostGroupHosts(sshHostGroupId)
      });
    }
  });
};

export const useRemoveHostFromSshHostGroup = () => {
  const queryClient = useQueryClient();
  return useMutation<void, object, { sshHostGroupId: string; sshHostId: string }>({
    mutationFn: async ({ sshHostGroupId, sshHostId }) => {
      await apiRequest.delete(`/api/v1/ssh/host-groups/${sshHostGroupId}/hosts/${sshHostId}`);
    },
    onSuccess: (_, { sshHostGroupId }) => {
      queryClient.invalidateQueries({
        queryKey: sshHostGroupKeys.forSshHostGroupHosts(sshHostGroupId)
      });
    }
  });
};
