import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAiMcpServer,
  TGetOAuthStatusDTO,
  TListAiMcpServersDTO,
  TOAuthStatusResponse
} from "./types";

export const aiMcpServerKeys = {
  all: ["ai-mcp-servers"] as const,
  list: (params: { projectId: string }) => [...aiMcpServerKeys.all, "list", params] as const,
  getById: (serverId: string) => [...aiMcpServerKeys.all, "get-by-id", serverId] as const,
  oauthStatus: (sessionId: string) => [...aiMcpServerKeys.all, "oauth-status", sessionId] as const
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

export const useGetAiMcpServerById = (serverId: string) => {
  return useQuery({
    queryKey: aiMcpServerKeys.getById(serverId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        server: TAiMcpServer;
      }>(`/api/v1/ai/mcp-servers/${serverId}`);
      return data.server;
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
