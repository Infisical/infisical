import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentVaultKeys } from "./queries";
import {
  TAddAgentVaultMemberDTO,
  TAgentVaultAccessBundle,
  TAgentVaultConflictWarning,
  TAgentVaultConnection,
  TAgentVaultEnrollment,
  TAgentVaultMintedSession,
  TAgentVaultProxy,
  TAgentVaultProxySettingsDTO,
  TCreateAgentVaultAccessBundleDTO,
  TCreateAgentVaultConnectionDTO,
  TCreateAgentVaultSessionDTO,
  TUpdateAgentVaultAccessBundleDTO,
  TUpdateAgentVaultConnectionDTO
} from "./types";

export const useCreateAgentVaultAccessBundle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.post<{ accessBundle: TAgentVaultAccessBundle }>(
        "/api/v1/agent-vault/access-bundles",
        params
      );
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useUpdateAgentVaultAccessBundle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TUpdateAgentVaultAccessBundleDTO) => {
      const { data } = await apiRequest.patch<{ accessBundle: TAgentVaultAccessBundle }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`,
        params
      );
      return data.accessBundle;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
    }
  });
};

export const useDeleteAgentVaultAccessBundle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accessBundleId: string) => {
      const { data } = await apiRequest.delete<{ accessBundle: TAgentVaultAccessBundle }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions() });
    }
  });
};

export const useCreateAgentVaultConnection = () => {
  const queryClient = useQueryClient();
  // Host-pattern validation errors are mapped onto the sheet's Hosts field, so the global
  // Validation Error toast would only duplicate them.
  return useMutation({
    meta: { skipValidationToast: true },
    mutationFn: async ({ accessBundleId, ...params }: TCreateAgentVaultConnectionDTO) => {
      const { data } = await apiRequest.post<{
        connection: TAgentVaultConnection;
        warnings: TAgentVaultConflictWarning[];
      }>(`/api/v1/agent-vault/access-bundles/${accessBundleId}/connections`, params);
      return data;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useUpdateAgentVaultConnection = () => {
  const queryClient = useQueryClient();
  // Host-pattern validation errors are mapped onto the sheet's Hosts field, so the global
  // Validation Error toast would only duplicate them.
  return useMutation({
    meta: { skipValidationToast: true },
    mutationFn: async ({
      accessBundleId,
      connectionId,
      ...params
    }: TUpdateAgentVaultConnectionDTO) => {
      const { data } = await apiRequest.patch<{
        connection: TAgentVaultConnection;
        warnings: TAgentVaultConflictWarning[];
      }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/connections/${connectionId}`,
        params
      );
      return data;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useDeleteAgentVaultConnection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      connectionId
    }: {
      accessBundleId: string;
      connectionId: string;
    }) => {
      const { data } = await apiRequest.delete<{ connection: { id: string; name: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/connections/${connectionId}`
      );
      return data.connection;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useAddAgentVaultAccessBundleMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessBundleId, ...params }: TAddAgentVaultMemberDTO) => {
      const { data } = await apiRequest.post<{ member: { id: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members`,
        params
      );
      return data.member;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useRemoveAgentVaultAccessBundleMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessBundleId,
      memberId
    }: {
      accessBundleId: string;
      memberId: string;
    }) => {
      const { data } = await apiRequest.delete<{ member: { id: string } }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/members/${memberId}`
      );
      return data.member;
    },
    onSuccess: (_, { accessBundleId }) => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundle(accessBundleId) });
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles() });
    }
  });
};

export const useCreateAgentVaultSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TCreateAgentVaultSessionDTO) => {
      const { data } = await apiRequest.post<{ session: TAgentVaultMintedSession }>(
        "/api/v1/agent-vault/sessions",
        params
      );
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions() });
    }
  });
};

export const useRevokeAgentVaultSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data } = await apiRequest.post<{
        session: { id: string; revokedAt: string | null };
      }>(`/api/v1/agent-vault/sessions/${sessionId}/revoke`);
      return data.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.sessions() });
    }
  });
};

export const useCreateAgentVaultProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: TAgentVaultProxySettingsDTO) => {
      const { data } = await apiRequest.post<{
        proxy: TAgentVaultProxy;
        enrollment: TAgentVaultEnrollment;
      }>("/api/v1/agent-vault/proxies", params);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies() });
    }
  });
};

export const useUpdateAgentVaultProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proxyId,
      ...params
    }: Partial<TAgentVaultProxySettingsDTO> & { proxyId: string }) => {
      const { data } = await apiRequest.patch<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}`,
        params
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies() });
    }
  });
};

export const useDeleteAgentVaultProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.delete<{ proxy: { id: string; name: string } }>(
        `/api/v1/agent-vault/proxies/${proxyId}`
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies() });
    }
  });
};

export const useReissueAgentVaultProxyEnrollmentToken = () =>
  useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<{ enrollment: TAgentVaultEnrollment }>(
        `/api/v1/agent-vault/proxies/${proxyId}/enrollment-token`
      );
      return data.enrollment;
    }
  });

export const useRevokeAgentVaultProxyAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proxyId: string) => {
      const { data } = await apiRequest.post<{ proxy: TAgentVaultProxy }>(
        `/api/v1/agent-vault/proxies/${proxyId}/revoke`
      );
      return data.proxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentVaultKeys.proxies() });
    }
  });
};
