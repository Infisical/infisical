import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentProxyQueryKeys } from "./queries";
import {
  TAgentProxy,
  TAgentProxyEnrollmentToken,
  TCreateAgentProxyDTO,
  TUpdateAgentProxyDTO
} from "./types";

export const useCreateAgentProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreateAgentProxyDTO) => {
      const { data } = await apiRequest.post<{ agentProxy: TAgentProxy }>(
        "/api/v1/agent-proxies",
        dto
      );
      return data.agentProxy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.list() });
    }
  });
};

export const useUpdateAgentProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentProxyId, ...body }: TUpdateAgentProxyDTO) => {
      const { data } = await apiRequest.patch<{ agentProxy: TAgentProxy }>(
        `/api/v1/agent-proxies/${agentProxyId}`,
        body
      );
      return data.agentProxy;
    },
    onSuccess: (_, { agentProxyId }) => {
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.byId(agentProxyId) });
    }
  });
};

export const useDeleteAgentProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentProxyId: string) =>
      apiRequest.delete(`/api/v1/agent-proxies/${agentProxyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.list() });
    }
  });
};

export const useGenerateAgentProxyEnrollmentToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agentProxyId: string) => {
      const { data } = await apiRequest.post<TAgentProxyEnrollmentToken>(
        `/api/v1/agent-proxies/${agentProxyId}/token-auth/generate-enrollment-token`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.list() });
    }
  });
};

export const useRevokeAgentProxyAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agentProxyId: string) => {
      const { data } = await apiRequest.post<{ method: string }>(
        `/api/v1/agent-proxies/${agentProxyId}/revoke`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentProxyQueryKeys.list() });
    }
  });
};
