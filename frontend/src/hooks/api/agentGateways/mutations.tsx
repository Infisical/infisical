import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { agentGatewayKeys } from "./queries";
import {
  AgentGatewayPrincipalKind,
  TAgentGateway,
  TAgentGatewayAccessDTO,
  TAgentGatewayAccessEntry,
  TAgentGatewayBase,
  TAgentGatewayServiceLinkDTO,
  TCreateAgentGatewayDTO,
  TDeleteAgentGatewayDTO,
  TReorderAgentGatewayServicesDTO,
  TUpdateAgentGatewayDTO
} from "./types";

const ACCESS_SEGMENT: Record<AgentGatewayPrincipalKind, string> = {
  [AgentGatewayPrincipalKind.User]: "users",
  [AgentGatewayPrincipalKind.Identity]: "identities",
  [AgentGatewayPrincipalKind.Group]: "groups"
};

export const useCreateAgentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGateway, object, TCreateAgentGatewayDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ agentGateway: TAgentGateway }>(
        "/api/v1/agent-gateways",
        dto
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useUpdateAgentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGateway, object, TUpdateAgentGatewayDTO>({
    mutationFn: async ({ agentGatewayId, ...body }) => {
      const { data } = await apiRequest.patch<{ agentGateway: TAgentGateway }>(
        `/api/v1/agent-gateways/${agentGatewayId}`,
        body
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useDeleteAgentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGatewayBase, object, TDeleteAgentGatewayDTO>({
    mutationFn: async ({ agentGatewayId }) => {
      const { data } = await apiRequest.delete<{ agentGateway: TAgentGatewayBase }>(
        `/api/v1/agent-gateways/${agentGatewayId}`
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useLinkProxiedService = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGateway, object, TAgentGatewayServiceLinkDTO>({
    mutationFn: async ({ agentGatewayId, serviceId }) => {
      const { data } = await apiRequest.post<{ agentGateway: TAgentGateway }>(
        `/api/v1/agent-gateways/${agentGatewayId}/services/${serviceId}`
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useUnlinkProxiedService = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGateway, object, TAgentGatewayServiceLinkDTO>({
    mutationFn: async ({ agentGatewayId, serviceId }) => {
      const { data } = await apiRequest.delete<{ agentGateway: TAgentGateway }>(
        `/api/v1/agent-gateways/${agentGatewayId}/services/${serviceId}`
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useReorderProxiedServices = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGateway, object, TReorderAgentGatewayServicesDTO>({
    mutationFn: async ({ agentGatewayId, serviceIds }) => {
      const { data } = await apiRequest.put<{ agentGateway: TAgentGateway }>(
        `/api/v1/agent-gateways/${agentGatewayId}/services`,
        { serviceIds }
      );
      return data.agentGateway;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useGrantAgentGatewayAccess = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGatewayAccessEntry[], object, TAgentGatewayAccessDTO>({
    mutationFn: async ({ agentGatewayId, kind, principalId }) => {
      const { data } = await apiRequest.post<{ access: TAgentGatewayAccessEntry[] }>(
        `/api/v1/agent-gateways/${agentGatewayId}/access/${ACCESS_SEGMENT[kind]}/${principalId}`
      );
      return data.access;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};

export const useRevokeAgentGatewayAccess = () => {
  const queryClient = useQueryClient();

  return useMutation<TAgentGatewayAccessEntry[], object, TAgentGatewayAccessDTO>({
    mutationFn: async ({ agentGatewayId, kind, principalId }) => {
      const { data } = await apiRequest.delete<{ access: TAgentGatewayAccessEntry[] }>(
        `/api/v1/agent-gateways/${agentGatewayId}/access/${ACCESS_SEGMENT[kind]}/${principalId}`
      );
      return data.access;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all })
  });
};
