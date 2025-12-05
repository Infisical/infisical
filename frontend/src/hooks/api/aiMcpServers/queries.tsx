import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAiMcpServer,
  TAiMcpServerTool,
  TGetOAuthStatusDTO,
  TListAiMcpServersDTO,
  TListAiMcpServerToolsDTO,
  TOAuthStatusResponse
} from "./types";

export const aiMcpServerKeys = {
  all: ["ai-mcp-servers"] as const,
  list: (params: { projectId: string }) => [...aiMcpServerKeys.all, "list", params] as const,
  getById: (serverId: string) => [...aiMcpServerKeys.all, "get-by-id", serverId] as const,
  oauthStatus: (sessionId: string) => [...aiMcpServerKeys.all, "oauth-status", sessionId] as const,
  tools: (serverId: string) => [...aiMcpServerKeys.all, "tools", serverId] as const
};

export const useListAiMcpServers = ({
  projectId,
  limit = 100,
  offset = 0
}: TListAiMcpServersDTO) => {
  return useQuery({
    queryKey: aiMcpServerKeys.list({ projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        servers: TAiMcpServer[];
        totalCount: number;
      }>("/api/v1/ai/mcp-servers", {
        params: { projectId, limit, offset }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetAiMcpServerById = (
  serverId: string,
  options?: Omit<UseQueryOptions<TAiMcpServer>, "queryKey" | "queryFn">
) => {
  return useQuery({
    queryKey: aiMcpServerKeys.getById(serverId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        server: TAiMcpServer;
      }>(`/api/v1/ai/mcp-servers/${serverId}`);
      return data.server;
    },
    enabled: Boolean(serverId),
    ...options
  });
};

export const useListAiMcpServerTools = ({ serverId }: TListAiMcpServerToolsDTO) => {
  return useQuery({
    queryKey: aiMcpServerKeys.tools(serverId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        tools: TAiMcpServerTool[];
      }>(`/api/v1/ai/mcp-servers/${serverId}/tools`);
      return data;
    },
    enabled: Boolean(serverId)
  });
};

export const useGetOAuthStatus = (
  { sessionId }: TGetOAuthStatusDTO,
  { enabled = true, refetchInterval }: { enabled?: boolean; refetchInterval?: number | false }
) => {
  return useQuery({
    queryKey: aiMcpServerKeys.oauthStatus(sessionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOAuthStatusResponse>(
        `/api/v1/ai/mcp-servers/oauth/status/${sessionId}`
      );
      return data;
    },
    enabled: Boolean(sessionId) && enabled,
    refetchInterval
  });
};
