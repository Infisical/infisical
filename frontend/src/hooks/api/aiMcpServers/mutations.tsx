import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { aiMcpServerKeys } from "./queries";
import {
  TAiMcpServer,
  TAiMcpServerTool,
  TCreateAiMcpServerDTO,
  TDeleteAiMcpServerDTO,
  TInitiateOAuthDTO,
  TInitiateOAuthResponse,
  TSyncAiMcpServerToolsDTO,
  TUpdateAiMcpServerDTO
} from "./types";

export const useCreateAiMcpServer = () => {
  const queryClient = useQueryClient();

  return useMutation<TAiMcpServer, object, TCreateAiMcpServerDTO>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{
        server: TAiMcpServer;
      }>("/api/v1/ai/mcp/servers", data);
      return response.server;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.list({ projectId })
      });
    }
  });
};

export const useUpdateAiMcpServer = () => {
  const queryClient = useQueryClient();

  return useMutation<TAiMcpServer, object, TUpdateAiMcpServerDTO>({
    mutationFn: async ({ serverId, ...data }) => {
      const { data: response } = await apiRequest.patch<{
        server: TAiMcpServer;
      }>(`/api/v1/ai/mcp/servers/${serverId}`, data);
      return response.server;
    },
    onSuccess: (server, { serverId }) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.list({ projectId: server.projectId })
      });
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.getById(serverId)
      });
    }
  });
};

export const useDeleteAiMcpServer = () => {
  const queryClient = useQueryClient();

  return useMutation<TAiMcpServer, object, TDeleteAiMcpServerDTO>({
    mutationFn: async ({ serverId }) => {
      const { data: response } = await apiRequest.delete<{
        server: TAiMcpServer;
      }>(`/api/v1/ai/mcp/servers/${serverId}`);
      return response.server;
    },
    onSuccess: (server, { serverId }) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.list({ projectId: server.projectId })
      });
      queryClient.removeQueries({
        queryKey: aiMcpServerKeys.getById(serverId)
      });
    }
  });
};

export const useInitiateOAuth = () => {
  return useMutation<TInitiateOAuthResponse, object, TInitiateOAuthDTO>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<TInitiateOAuthResponse>(
        "/api/v1/ai/mcp/servers/oauth/initiate",
        data
      );
      return response;
    }
  });
};

export const useSyncAiMcpServerTools = () => {
  const queryClient = useQueryClient();

  return useMutation<{ tools: TAiMcpServerTool[] }, object, TSyncAiMcpServerToolsDTO>({
    mutationFn: async ({ serverId }) => {
      const { data: response } = await apiRequest.post<{
        tools: TAiMcpServerTool[];
      }>(`/api/v1/ai/mcp/servers/${serverId}/tools/sync`, {});
      return response;
    },
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.tools(serverId)
      });
    }
  });
};
