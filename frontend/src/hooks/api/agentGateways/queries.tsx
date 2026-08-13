import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAgentGateway,
  TAgentGatewayAccessEntry,
  TAgentGatewayListItem,
  TAgentGatewaySession,
  TAgentGatewaySessionRequest
} from "./types";

export const agentGatewayKeys = {
  all: ["agentGateways"] as const,
  list: ({ projectId, search }: { projectId: string; search?: string }) =>
    [...agentGatewayKeys.all, "list", { projectId, search }] as const,
  byId: (agentGatewayId: string) => [...agentGatewayKeys.all, "byId", agentGatewayId] as const,
  access: (agentGatewayId: string) => [...agentGatewayKeys.all, "access", agentGatewayId] as const,
  sessions: (agentGatewayId: string) =>
    [...agentGatewayKeys.all, "sessions", agentGatewayId] as const,
  sessionRequests: (sessionId: string) =>
    [...agentGatewayKeys.all, "sessionRequests", sessionId] as const
};

export const useListAgentGateways = ({
  projectId,
  search
}: {
  projectId: string;
  search?: string;
}) =>
  useQuery({
    queryKey: agentGatewayKeys.list({ projectId, search }),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        agentGateways: TAgentGatewayListItem[];
        totalCount: number;
      }>("/api/v1/agent-gateways", { params: { projectId, ...(search ? { search } : {}) } });
      return data;
    }
  });

export const useGetAgentGatewayById = (agentGatewayId: string) =>
  useQuery({
    queryKey: agentGatewayKeys.byId(agentGatewayId),
    enabled: Boolean(agentGatewayId),
    // Health is part of this payload and the deploy card acts on it, so it is refetched on the same cadence
    // the gateway list uses rather than sitting behind the default 60s staleTime.
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ agentGateway: TAgentGateway }>(
        `/api/v1/agent-gateways/${agentGatewayId}`
      );
      return data.agentGateway;
    }
  });

export const useGetAgentGatewayAccess = (agentGatewayId: string) =>
  useQuery({
    queryKey: agentGatewayKeys.access(agentGatewayId),
    enabled: Boolean(agentGatewayId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ access: TAgentGatewayAccessEntry[] }>(
        `/api/v1/agent-gateways/${agentGatewayId}/access`
      );
      return data.access;
    }
  });

// Sessions are a live view during a demo or an incident, so they refresh on their own rather than waiting for
// the default staleTime.
export const useListAgentGatewaySessions = (agentGatewayId: string) =>
  useQuery({
    queryKey: agentGatewayKeys.sessions(agentGatewayId),
    enabled: Boolean(agentGatewayId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        sessions: TAgentGatewaySession[];
        totalCount: number;
      }>(`/api/v1/agent-gateways/${agentGatewayId}/sessions`);
      return data;
    }
  });

export const useListAgentGatewaySessionRequests = (sessionId?: string) =>
  useQuery({
    queryKey: agentGatewayKeys.sessionRequests(sessionId ?? ""),
    enabled: Boolean(sessionId),
    // A recording of a running session keeps growing, and the broker flushes every five seconds.
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        totalCount: number;
        session: {
          id: string;
          mode: string;
          status: string;
          actorName: string;
          createdAt: string;
          endedAt: string | null;
        };
        requests: TAgentGatewaySessionRequest[];
      }>(`/api/v1/agent-gateways/sessions/${sessionId}/requests`);
      return data;
    }
  });
