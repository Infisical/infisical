import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects/query-keys";
import { TCreateSshHostDTO, TDeleteSshHostDTO, TSshHost, TUpdateSshHostDTO } from "./types";

export const useCreateSshHost = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHost, object, TCreateSshHostDTO>({
    mutationFn: async (body) => {
      const { data: host } = await apiRequest.post("/api/v1/ssh/hosts", body);
      return host;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectSshHosts(projectId) });
    }
  });
};

export const useUpdateSshHost = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHost, object, TUpdateSshHostDTO>({
    mutationFn: async ({ sshHostId, ...body }) => {
      const { data: host } = await apiRequest.patch(`/api/v1/ssh/hosts/${sshHostId}`, body);
      return host;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectSshHosts(projectId) });
    }
  });
};

export const useDeleteSshHost = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshHost, object, TDeleteSshHostDTO>({
    mutationFn: async ({ sshHostId }) => {
      const { data: host } = await apiRequest.delete(`/api/v1/ssh/hosts/${sshHostId}`);
      return host;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectSshHosts(projectId) });
    }
  });
};
