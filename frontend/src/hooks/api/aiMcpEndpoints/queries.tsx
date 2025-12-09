import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAiMcpEndpoint,
  TAiMcpEndpointToolConfig,
  TAiMcpEndpointWithServerIds,
  TListAiMcpEndpointsDTO,
  TServerAuthStatus
} from "./types";

export const aiMcpEndpointKeys = {
  all: ["aiMcpEndpoints"] as const,
  list: (projectId: string) => [...aiMcpEndpointKeys.all, "list", projectId] as const,
  byId: (endpointId: string) => [...aiMcpEndpointKeys.all, "byId", endpointId] as const,
  tools: (endpointId: string) => [...aiMcpEndpointKeys.all, "tools", endpointId] as const,
  serversRequiringAuth: (endpointId: string) =>
    [...aiMcpEndpointKeys.all, "serversRequiringAuth", endpointId] as const
};

export const useListAiMcpEndpoints = ({ projectId }: TListAiMcpEndpointsDTO) => {
  return useQuery({
    queryKey: aiMcpEndpointKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        endpoints: TAiMcpEndpoint[];
        totalCount: number;
      }>("/api/v1/ai/mcp-endpoints", {
        params: { projectId }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetAiMcpEndpointById = ({ endpointId }: { endpointId: string }) => {
  return useQuery({
    queryKey: aiMcpEndpointKeys.byId(endpointId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ endpoint: TAiMcpEndpointWithServerIds }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}`
      );
      return data.endpoint;
    },
    enabled: Boolean(endpointId)
  });
};

export const useListEndpointTools = ({ endpointId }: { endpointId: string }) => {
  return useQuery({
    queryKey: aiMcpEndpointKeys.tools(endpointId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ tools: TAiMcpEndpointToolConfig[] }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}/tools`
      );
      return data.tools;
    },
    enabled: Boolean(endpointId)
  });
};

export const useGetServersRequiringAuth = ({ endpointId }: { endpointId: string }) => {
  return useQuery({
    queryKey: aiMcpEndpointKeys.serversRequiringAuth(endpointId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ servers: TServerAuthStatus[] }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}/servers-requiring-auth`
      );
      return data.servers;
    },
    enabled: Boolean(endpointId)
  });
};
