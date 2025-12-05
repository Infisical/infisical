import { NotFoundError } from "@app/lib/errors";

import { TAiMcpEndpointDALFactory } from "./ai-mcp-endpoint-dal";
import { TAiMcpEndpointServerDALFactory } from "./ai-mcp-endpoint-server-dal";
import { TAiMcpEndpointServerToolDALFactory } from "./ai-mcp-endpoint-server-tool-dal";
import {
  TAiMcpEndpointWithServers,
  TBulkUpdateEndpointToolsDTO,
  TCreateAiMcpEndpointDTO,
  TDeleteAiMcpEndpointDTO,
  TDisableEndpointToolDTO,
  TEnableEndpointToolDTO,
  TGetAiMcpEndpointDTO,
  TListAiMcpEndpointsDTO,
  TListEndpointToolsDTO,
  TUpdateAiMcpEndpointDTO
} from "./ai-mcp-endpoint-types";

type TAiMcpEndpointServiceFactoryDep = {
  aiMcpEndpointDAL: TAiMcpEndpointDALFactory;
  aiMcpEndpointServerDAL: TAiMcpEndpointServerDALFactory;
  aiMcpEndpointServerToolDAL: TAiMcpEndpointServerToolDALFactory;
};

export type TAiMcpEndpointServiceFactory = ReturnType<typeof aiMcpEndpointServiceFactory>;

export const aiMcpEndpointServiceFactory = ({
  aiMcpEndpointDAL,
  aiMcpEndpointServerDAL,
  aiMcpEndpointServerToolDAL
}: TAiMcpEndpointServiceFactoryDep) => {
  const createMcpEndpoint = async ({ projectId, name, description, serverIds }: TCreateAiMcpEndpointDTO) => {
    const endpoint = await aiMcpEndpointDAL.create({
      projectId,
      name,
      description,
      status: "active"
    });

    // Connect servers if provided
    if (serverIds && serverIds.length > 0) {
      await aiMcpEndpointServerDAL.insertMany(
        serverIds.map((serverId) => ({
          aiMcpEndpointId: endpoint.id,
          aiMcpServerId: serverId
        }))
      );
    }

    return endpoint;
  };

  const listMcpEndpoints = async ({ projectId }: TListAiMcpEndpointsDTO): Promise<TAiMcpEndpointWithServers[]> => {
    const endpoints = await aiMcpEndpointDAL.find({ projectId });

    // Get connected servers count and tools count for each endpoint
    const endpointsWithStats = await Promise.all(
      endpoints.map(async (endpoint) => {
        const connectedServers = await aiMcpEndpointServerDAL.find({ aiMcpEndpointId: endpoint.id });
        const tools = await aiMcpEndpointServerToolDAL.find({ aiMcpEndpointId: endpoint.id });

        return {
          ...endpoint,
          connectedServers: connectedServers.length,
          activeTools: tools.length
        };
      })
    );

    return endpointsWithStats;
  };

  const getMcpEndpointById = async ({ endpointId }: TGetAiMcpEndpointDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const connectedServers = await aiMcpEndpointServerDAL.find({ aiMcpEndpointId: endpointId });
    const tools = await aiMcpEndpointServerToolDAL.find({ aiMcpEndpointId: endpointId });

    return {
      ...endpoint,
      connectedServers: connectedServers.length,
      activeTools: tools.length,
      serverIds: connectedServers.map((s) => s.aiMcpServerId)
    };
  };

  const updateMcpEndpoint = async ({ endpointId, name, description, serverIds }: TUpdateAiMcpEndpointDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const updateData: { name?: string; description?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedEndpoint = await aiMcpEndpointDAL.updateById(endpointId, updateData);

    // Update server connections if provided
    if (serverIds !== undefined) {
      // Delete existing connections
      await aiMcpEndpointServerDAL.delete({ aiMcpEndpointId: endpointId });

      // Add new connections
      if (serverIds.length > 0) {
        await aiMcpEndpointServerDAL.insertMany(
          serverIds.map((serverId) => ({
            aiMcpEndpointId: endpointId,
            aiMcpServerId: serverId
          }))
        );
      }
    }

    return updatedEndpoint;
  };

  const deleteMcpEndpoint = async ({ endpointId }: TDeleteAiMcpEndpointDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    // Delete endpoint
    await aiMcpEndpointDAL.deleteById(endpointId);

    return endpoint;
  };

  const listEndpointTools = async ({ endpointId }: TListEndpointToolsDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const toolConfigs = await aiMcpEndpointServerToolDAL.find({ aiMcpEndpointId: endpointId });
    return toolConfigs;
  };

  const enableEndpointTool = async ({ endpointId, serverToolId }: TEnableEndpointToolDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const existingConfig = await aiMcpEndpointServerToolDAL.findOne({
      aiMcpEndpointId: endpointId,
      aiMcpServerToolId: serverToolId
    });

    if (existingConfig) {
      return existingConfig;
    }

    return aiMcpEndpointServerToolDAL.create({
      aiMcpEndpointId: endpointId,
      aiMcpServerToolId: serverToolId,
      isEnabled: true
    });
  };

  const disableEndpointTool = async ({ endpointId, serverToolId }: TDisableEndpointToolDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const existingConfig = await aiMcpEndpointServerToolDAL.findOne({
      aiMcpEndpointId: endpointId,
      aiMcpServerToolId: serverToolId
    });

    if (existingConfig) {
      await aiMcpEndpointServerToolDAL.deleteById(existingConfig.id);
    }
  };

  const bulkUpdateEndpointTools = async ({ endpointId, tools }: TBulkUpdateEndpointToolsDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    // Separate tools to enable and disable
    const toEnable = tools.filter((t) => t.isEnabled);
    const toDisable = tools.filter((t) => !t.isEnabled);

    // Delete disabled tools
    if (toDisable.length > 0) {
      await Promise.all(
        toDisable.map(async ({ serverToolId }) => {
          const existing = await aiMcpEndpointServerToolDAL.findOne({
            aiMcpEndpointId: endpointId,
            aiMcpServerToolId: serverToolId
          });
          if (existing) {
            await aiMcpEndpointServerToolDAL.deleteById(existing.id);
          }
        })
      );
    }

    // Create enabled tools (if not already existing)
    const results = await Promise.all(
      toEnable.map(async ({ serverToolId }) => {
        const existing = await aiMcpEndpointServerToolDAL.findOne({
          aiMcpEndpointId: endpointId,
          aiMcpServerToolId: serverToolId
        });
        if (existing) {
          return existing;
        }
        return aiMcpEndpointServerToolDAL.create({
          aiMcpEndpointId: endpointId,
          aiMcpServerToolId: serverToolId,
          isEnabled: true
        });
      })
    );

    return results;
  };

  return {
    createMcpEndpoint,
    listMcpEndpoints,
    getMcpEndpointById,
    updateMcpEndpoint,
    deleteMcpEndpoint,
    listEndpointTools,
    enableEndpointTool,
    disableEndpointTool,
    bulkUpdateEndpointTools
  };
};
