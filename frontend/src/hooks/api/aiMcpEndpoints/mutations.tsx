import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { aiMcpEndpointKeys } from "./queries";
import {
  TAiMcpEndpoint,
  TAiMcpEndpointToolConfig,
  TBulkUpdateEndpointToolsDTO,
  TCreateAiMcpEndpointDTO,
  TDeleteAiMcpEndpointDTO,
  TDisableEndpointToolDTO,
  TEnableEndpointToolDTO,
  TUpdateAiMcpEndpointDTO
} from "./types";

export const useCreateAiMcpEndpoint = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateAiMcpEndpointDTO) => {
      const { data } = await apiRequest.post<{ endpoint: TAiMcpEndpoint }>(
        "/api/v1/ai/mcp-endpoints",
        dto
      );
      return data.endpoint;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.list(variables.projectId)
      });
    }
  });
};

export const useUpdateAiMcpEndpoint = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ endpointId, ...dto }: TUpdateAiMcpEndpointDTO) => {
      const { data } = await apiRequest.patch<{ endpoint: TAiMcpEndpoint }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}`,
        dto
      );
      return data.endpoint;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.list(data.projectId)
      });
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.byId(data.id)
      });
    }
  });
};

export const useDeleteAiMcpEndpoint = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ endpointId }: TDeleteAiMcpEndpointDTO) => {
      const { data } = await apiRequest.delete<{ endpoint: TAiMcpEndpoint }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}`
      );
      return data.endpoint;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.list(data.projectId)
      });
    }
  });
};

export const useEnableEndpointTool = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ endpointId, serverToolId }: TEnableEndpointToolDTO) => {
      const { data } = await apiRequest.post<{ tool: TAiMcpEndpointToolConfig }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}/tools/${serverToolId}`
      );
      return data.tool;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.tools(variables.endpointId)
      });
    }
  });
};

export const useDisableEndpointTool = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ endpointId, serverToolId }: TDisableEndpointToolDTO) => {
      await apiRequest.delete(`/api/v1/ai/mcp-endpoints/${endpointId}/tools/${serverToolId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.tools(variables.endpointId)
      });
    }
  });
};

export const useBulkUpdateEndpointTools = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ endpointId, tools }: TBulkUpdateEndpointToolsDTO) => {
      const { data } = await apiRequest.patch<{ tools: TAiMcpEndpointToolConfig[] }>(
        `/api/v1/ai/mcp-endpoints/${endpointId}/tools/bulk`,
        { tools }
      );
      return data.tools;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: aiMcpEndpointKeys.tools(variables.endpointId)
      });
    }
  });
};
