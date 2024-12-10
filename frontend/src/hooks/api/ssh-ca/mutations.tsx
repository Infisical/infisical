import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/query-keys";
import {
  TCreateSshCaDTO,
  TDeleteSshCaDTO,
  TIssueSshCredsDTO,
  TIssueSshCredsResponse,
  TSignSshKeyDTO,
  TSignSshKeyResponse,
  TSshCertificateAuthority,
  TUpdateSshCaDTO
} from "./types";

export const sshCaKeys = {
  getSshCaById: (caId: string) => [{ caId }, "ssh-ca"]
};

export const useCreateSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TCreateSshCaDTO>({
    mutationFn: async (body) => {
      const {
        data: { ca }
      } = await apiRequest.post<{ ca: TSshCertificateAuthority }>("/api/v1/ssh/ca/", body);
      return ca;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceSshCas(projectId));
    }
  });
};

export const useUpdateSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TUpdateSshCaDTO>({
    mutationFn: async ({ caId, ...body }) => {
      const {
        data: { ca }
      } = await apiRequest.patch<{ ca: TSshCertificateAuthority }>(`/api/v1/ssh/ca/${caId}`, body);
      return ca;
    },
    onSuccess: ({ projectId }, { caId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceSshCas(projectId));
      queryClient.invalidateQueries(sshCaKeys.getSshCaById(caId));
    }
  });
};

export const useDeleteSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TDeleteSshCaDTO>({
    mutationFn: async ({ caId }) => {
      const {
        data: { ca }
      } = await apiRequest.delete<{ ca: TSshCertificateAuthority }>(`/api/v1/ssh/ca/${caId}`);
      return ca;
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceSshCas(projectId));
    }
  });
};

export const useSignSshKey = () => {
  const queryClient = useQueryClient();
  return useMutation<TSignSshKeyResponse, {}, TSignSshKeyDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TSignSshKeyResponse>("/api/v1/ssh/sign", body);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.allWorkspaceSshCertificates(projectId));
    }
  });
};

export const useIssueSshCreds = () => {
  const queryClient = useQueryClient();
  return useMutation<TIssueSshCredsResponse, {}, TIssueSshCredsDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TIssueSshCredsResponse>("/api/v1/ssh/issue", body);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.allWorkspaceSshCertificates(projectId));
    }
  });
};
