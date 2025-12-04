import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { aiMcpServerKeys } from "./queries";
import {
  TAiMcpServer,
  TCreateAiMcpServerDTO,
  TDeleteAiMcpServerDTO,
  TInitiateOAuthDTO,
  TInitiateOAuthResponse
} from "./types";

export const useCreateAiMcpServer = () => {
  const queryClient = useQueryClient();

  return useMutation<TAiMcpServer, object, TCreateAiMcpServerDTO>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{
        server: TAiMcpServer;
      }>("/api/v1/ai/mcp-servers", data);
      return response.server;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpServerKeys.list({ projectId })
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
      }>(`/api/v1/ai/mcp-servers/${serverId}`);
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
        "/api/v1/ai/mcp-servers/oauth/initiate",
        data
      );
      return response;
    }
  });
};
