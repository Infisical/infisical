import crypto from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server as RawMcpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto as cryptoModule } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAiMcpActivityLogServiceFactory } from "../ai-mcp-activity-log/ai-mcp-activity-log-service";
import { TAiMcpServerDALFactory } from "../ai-mcp-server/ai-mcp-server-dal";
import { AiMcpServerCredentialMode } from "../ai-mcp-server/ai-mcp-server-enum";
import { TAiMcpServerServiceFactory } from "../ai-mcp-server/ai-mcp-server-service";
import { TAiMcpServerToolDALFactory } from "../ai-mcp-server/ai-mcp-server-tool-dal";
import { TAiMcpServerUserCredentialDALFactory } from "../ai-mcp-server/ai-mcp-server-user-credential-dal";
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
  TGetServersRequiringAuthDTO,
  TInitiateServerOAuthDTO,
  TInteractWithMcpDTO,
  TListAiMcpEndpointsDTO,
  TListEndpointToolsDTO,
  TOAuthAuthorizeClientDTO,
  TOAuthFinalizeDTO,
  TOAuthRegisterClientDTO,
  TOAuthTokenExchangeDTO,
  TSaveUserServerCredentialDTO,
  TServerAuthStatus,
  TUpdateAiMcpEndpointDTO
} from "./ai-mcp-endpoint-types";

type TAiMcpEndpointServiceFactoryDep = {
  aiMcpEndpointDAL: TAiMcpEndpointDALFactory;
  aiMcpActivityLogService: TAiMcpActivityLogServiceFactory;
  aiMcpEndpointServerDAL: TAiMcpEndpointServerDALFactory;
  aiMcpEndpointServerToolDAL: TAiMcpEndpointServerToolDALFactory;
  aiMcpServerDAL: TAiMcpServerDALFactory;
  aiMcpServerToolDAL: TAiMcpServerToolDALFactory;
  aiMcpServerUserCredentialDAL: TAiMcpServerUserCredentialDALFactory;
  aiMcpServerService: Pick<
    TAiMcpServerServiceFactory,
    "getCredentialsForServer" | "initiateOAuth" | "getOAuthStatus" | "getServerOAuthConfig"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  authTokenService: Pick<TAuthTokenServiceFactory, "getUserTokenSessionById">;
  userDAL: TUserDALFactory;
};

// OAuth schemas for parsing cached data
const DynamicClientInfoSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.string()),
  client_name: z.string(),
  client_uri: z.string().optional(),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
  token_endpoint_auth_method: z.string(),
  client_id_issued_at: z.number(),
  state: z.string().optional()
});

const OauthChallengeCodeSchema = z.object({
  codeChallenge: z.string(),
  codeChallengeMethod: z.string(),
  userId: z.string(),
  endpointId: z.string(),
  expiry: z.string(),
  redirectUri: z.string(),
  userInfo: z.object({
    tokenId: z.string(),
    orgId: z.string(),
    authMethod: z.string().nullable(),
    email: z.string(),
    actorIp: z.string(),
    actorName: z.string(),
    actorUserAgent: z.string()
  })
});

const OAUTH_FLOW_EXPIRY_IN_SECS = 5 * 60;

// PKCE challenge computation
const computePkceChallenge = (codeVerifier: string) => {
  const sha256 = crypto.createHash("sha256").update(codeVerifier).digest();
  return Buffer.from(sha256).toString("base64url");
};

export type TAiMcpEndpointServiceFactory = ReturnType<typeof aiMcpEndpointServiceFactory>;

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
export const aiMcpEndpointServiceFactory = ({
  aiMcpEndpointDAL,
  aiMcpEndpointServerDAL,
  aiMcpEndpointServerToolDAL,
  aiMcpServerDAL,
  aiMcpServerToolDAL,
  aiMcpServerUserCredentialDAL,
  aiMcpServerService,
  aiMcpActivityLogService,
  kmsService,
  keyStore,
  authTokenService,
  userDAL
}: TAiMcpEndpointServiceFactoryDep) => {
  // PII filtering utility - redacts sensitive information
  const applyPiiFiltering = (data: unknown): unknown => {
    if (typeof data === "string") {
      let filtered = data;

      // Redact SSN (matches formats: 123-45-6789, 123456789)
      filtered = filtered.replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "<REDACTED>");

      // Redact Phone Numbers (matches various formats)
      // Matches: (123) 456-7890, 123-456-7890, 123.456.7890, 1234567890, +1 123 456 7890
      filtered = filtered.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "<REDACTED>");

      // Redact Email Addresses
      filtered = filtered.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "<REDACTED>");

      // Redact Passport Numbers (matches common formats)
      // Matches: US (9 digits), international alphanumeric (e.g., AB1234567, P12345678)
      filtered = filtered.replace(/\b[A-Z]{1,2}\d{6,9}\b/g, "<REDACTED>");
      filtered = filtered.replace(/\bP\d{8}\b/g, "<REDACTED>");

      // Redact Driver's License Numbers (matches common US state formats)
      // Matches various state formats: alphanumeric combinations typically 6-20 characters
      // Examples: CA: A1234567, TX: 12345678, NY: 123456789, FL: A123-456-78-901-0
      filtered = filtered.replace(/\b[A-Z]{1,2}[-\s]?\d{6,8}\b/g, "<REDACTED>");
      filtered = filtered.replace(/\b\d{7,9}\b/g, "<REDACTED>");
      filtered = filtered.replace(/\b[A-Z]\d{3}-\d{3}-\d{2}-\d{3}-\d\b/g, "<REDACTED>");

      // Redact State ID Numbers (similar patterns to driver's licenses)
      // Matches alphanumeric state ID formats
      filtered = filtered.replace(/\b[A-Z]{1,3}\d{5,12}\b/g, "<REDACTED>");

      return filtered;
    }

    if (Array.isArray(data)) {
      return data.map((item) => applyPiiFiltering(item));
    }

    if (data && typeof data === "object") {
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        filtered[key] = applyPiiFiltering(value);
      }
      return filtered;
    }

    return data;
  };

  const interactWithMcp = async ({ endpointId, userId }: TInteractWithMcpDTO) => {
    const appCfg = getConfig();

    // Get the endpoint
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const user = await userDAL.findById(userId);
    if (!user) {
      throw new NotFoundError({ message: `User with ID '${userId}' not found` });
    }

    // Get connected servers for this endpoint
    const connectedServerLinks = await aiMcpEndpointServerDAL.find({ aiMcpEndpointId: endpointId });

    // Get enabled tools for this endpoint
    const enabledToolConfigs = await aiMcpEndpointServerToolDAL.find({ aiMcpEndpointId: endpointId });
    const enabledToolIds = new Set(enabledToolConfigs.map((t) => t.aiMcpServerToolId));

    // Get the actual server details
    const serverIds = connectedServerLinks.map((link) => link.aiMcpServerId);
    const servers = await Promise.all(serverIds.map((id) => aiMcpServerDAL.findById(id)));
    const validServers = servers.filter((s) => s !== null && s !== undefined);

    if (validServers.length === 0) {
      // Return an empty MCP server if no servers are connected
      const emptyServer = new RawMcpServer(
        {
          name: "infisical-mcp-endpoint",
          version: appCfg.INFISICAL_PLATFORM_VERSION || "0.0.1"
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );
      emptyServer.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
      emptyServer.setRequestHandler(CallToolRequestSchema, () => {
        throw new Error("No MCP servers connected to this endpoint");
      });

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      return { server: emptyServer, transport };
    }

    // Connect to each server and get their tools
    const mcpClientTools = await Promise.all(
      validServers.map(async (mcpServer) => {
        // Get the database tool records for this server (to map tool names to IDs)
        const dbServerTools = await aiMcpServerToolDAL.find({ aiMcpServerId: mcpServer.id });
        // Create a map from tool name to database tool ID for this specific server
        const toolNameToDbId = new Map(dbServerTools.map((t) => [t.name, t.id]));

        // Get credentials based on server's credential mode
        const credentialsResult = await aiMcpServerService.getCredentialsForServer({
          serverId: mcpServer.id,
          serverUrl: mcpServer.url,
          credentialMode: mcpServer.credentialMode,
          projectId: endpoint.projectId,
          userId
        });

        if (!credentialsResult) {
          logger.warn(`No credentials found for MCP server ${mcpServer.name} (mode: ${mcpServer.credentialMode})`);
          return { client: null, server: mcpServer, tools: [], toolNameToDbId };
        }

        const headers: Record<string, string> = {};
        if (credentialsResult.accessToken) {
          headers.Authorization = `Bearer ${credentialsResult.accessToken}`;
        }

        try {
          const client = new Client({
            name: `infisical-mcp-client-${mcpServer.name}`,
            version: "1.0.0"
          });

          const clientTransport = new StreamableHTTPClientTransport(new URL(mcpServer.url), {
            requestInit: { headers }
          });

          await client.connect(clientTransport);

          // Get tools from this server
          const { tools } = await client.listTools();

          return {
            client,
            server: mcpServer,
            tools: tools as Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
            toolNameToDbId
          };
        } catch (error) {
          // If connection fails, return empty tools for this server
          logger.error(error, `Failed to connect to MCP server ${mcpServer.name} (${mcpServer.url})`);
          return { client: null, server: mcpServer, tools: [], toolNameToDbId };
        }
      })
    );

    // Filter tools to only include explicitly enabled ones (least privilege principle)
    // If no tools are explicitly enabled, no tools will be available
    const enabledMcpClientTools = mcpClientTools.map((clientTool) => ({
      ...clientTool,
      tools: clientTool.tools.filter((tool) => {
        // Get the database ID for this tool (specific to this server)
        const dbToolId = clientTool.toolNameToDbId.get(tool.name);
        // Only include if the database tool ID is explicitly enabled
        return dbToolId !== undefined && enabledToolIds.has(dbToolId);
      })
    }));

    // Create the aggregating MCP server
    const server = new RawMcpServer(
      {
        name: "infisical-mcp-endpoint",
        version: appCfg.INFISICAL_PLATFORM_VERSION || "0.0.1"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Handle ListTools request - aggregate tools from all connected servers
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: enabledMcpClientTools.flatMap((el) => el.tools)
    }));

    // Handle CallTool request - route to the appropriate server
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Find the server that has this tool
      const selectedMcpClient = enabledMcpClientTools.find((el) => el.tools.find((t) => t.name === name));
      if (!selectedMcpClient || !selectedMcpClient.client) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        // Apply PII filtering to arguments if enabled
        const filteredArgs = endpoint.piiFiltering ? applyPiiFiltering(args) : args;

        const result = await selectedMcpClient.client.callTool({
          name,
          arguments: filteredArgs
        });

        // Apply PII filtering to result if enabled
        const filteredResult = endpoint.piiFiltering ? applyPiiFiltering(result) : result;

        await aiMcpActivityLogService.createActivityLog({
          endpointName: endpoint.name,
          serverName: selectedMcpClient.server.name,
          toolName: name,
          actor: user.email || "",
          request: filteredArgs, // Log filtered args
          response: filteredResult, // Log filtered response
          projectId: endpoint.projectId
        });

        return filteredResult as Record<string, unknown>;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    return { server, transport };
  };

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

  const updateMcpEndpoint = async ({
    endpointId,
    name,
    description,
    serverIds,
    piiFiltering
  }: TUpdateAiMcpEndpointDTO) => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const updateData: { name?: string; description?: string; piiFiltering?: boolean } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (piiFiltering !== undefined) updateData.piiFiltering = piiFiltering;

    let updatedEndpoint = endpoint;
    if (Object.keys(updateData).length > 0) {
      updatedEndpoint = await aiMcpEndpointDAL.updateById(endpointId, updateData);
    }

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

  // OAuth 2.0 Methods
  const oauthRegisterClient = async ({
    endpointId,
    client_name,
    client_uri,
    grant_types,
    redirect_uris,
    response_types,
    token_endpoint_auth_method
  }: TOAuthRegisterClientDTO) => {
    // Verify the endpoint exists
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const clientId = `mcp_client_${crypto.randomBytes(32).toString("hex")}`;
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      client_id: clientId,
      client_name,
      client_uri,
      grant_types,
      redirect_uris,
      response_types,
      token_endpoint_auth_method,
      client_id_issued_at: now
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpEndpointOAuthClient(clientId),
      OAUTH_FLOW_EXPIRY_IN_SECS,
      JSON.stringify(payload)
    );

    return payload;
  };

  const oauthAuthorizeClient = async ({ clientId, state }: TOAuthAuthorizeClientDTO) => {
    const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.AiMcpEndpointOAuthClient(clientId));
    if (!oauthClientCache) {
      throw new UnauthorizedError({ message: `MCP OAuth client with id ${clientId} not found` });
    }

    // Update with state
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpEndpointOAuthClient(clientId),
      OAUTH_FLOW_EXPIRY_IN_SECS,
      JSON.stringify({ ...JSON.parse(oauthClientCache), state })
    );
  };

  const oauthFinalize = async ({
    endpointId,
    clientId,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    expiry,
    tokenId,
    userInfo,
    permission,
    userAgent,
    userIp
  }: TOAuthFinalizeDTO) => {
    const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.AiMcpEndpointOAuthClient(clientId));
    if (!oauthClientCache) {
      throw new UnauthorizedError({ message: `MCP OAuth client with id ${clientId} not found` });
    }

    const oauthClient = await DynamicClientInfoSchema.parseAsync(JSON.parse(oauthClientCache));
    const isValidRedirectUri = oauthClient.redirect_uris.some((el) => new URL(el).toString() === redirectUri);
    if (!isValidRedirectUri) throw new BadRequestError({ message: "Redirect URI mismatch" });

    // Verify endpoint exists
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const code = crypto.randomBytes(32).toString("hex");
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpEndpointOAuthCode(clientId, code),
      OAUTH_FLOW_EXPIRY_IN_SECS,
      JSON.stringify({
        codeChallenge,
        codeChallengeMethod,
        userId: permission.id,
        endpointId,
        expiry,
        redirectUri,
        userInfo: {
          tokenId,
          orgId: permission.orgId,
          authMethod: permission.authMethod,
          email: userInfo.email || "",
          actorIp: userIp,
          actorName: `${userInfo.firstName || ""} ${userInfo.lastName || ""}`.trim(),
          actorUserAgent: userAgent
        }
      })
    );

    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (oauthClient.state) url.searchParams.set("state", String(oauthClient.state));
    return url;
  };

  const oauthTokenExchange = async (dto: TOAuthTokenExchangeDTO) => {
    const appCfg = getConfig();

    if (dto.grant_type !== "authorization_code") {
      throw new BadRequestError({ message: "Only authorization_code grant type is supported" });
    }

    const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.AiMcpEndpointOAuthClient(dto.client_id));
    if (!oauthClientCache) {
      throw new UnauthorizedError({ message: `MCP OAuth client with id ${dto.client_id} not found` });
    }

    const oauthAuthorizeSessionCache = await keyStore.getItem(
      KeyStorePrefixes.AiMcpEndpointOAuthCode(dto.client_id, dto.code)
    );
    if (!oauthAuthorizeSessionCache) {
      throw new UnauthorizedError({ message: "MCP OAuth session not found" });
    }

    const oauthAuthorizeInfo = await OauthChallengeCodeSchema.parseAsync(JSON.parse(oauthAuthorizeSessionCache));
    const isInvalidRedirectUri = dto.redirect_uri !== oauthAuthorizeInfo.redirectUri;
    if (isInvalidRedirectUri) throw new BadRequestError({ message: "Redirect URI mismatch" });

    // Delete the code (one-time use)
    await keyStore.deleteItem(KeyStorePrefixes.AiMcpEndpointOAuthCode(dto.client_id, dto.code));

    // Verify PKCE challenge
    const challenge = computePkceChallenge(dto.code_verifier);
    if (challenge !== oauthAuthorizeInfo.codeChallenge) {
      throw new BadRequestError({ message: "PKCE challenge mismatch" });
    }

    // Verify user session is still valid
    const tokenSession = await authTokenService.getUserTokenSessionById(
      oauthAuthorizeInfo.userInfo.tokenId,
      oauthAuthorizeInfo.userId
    );
    if (!tokenSession) throw new UnauthorizedError({ message: "User session not found" });

    // Generate MCP access token
    const accessToken = cryptoModule.jwt().sign(
      {
        authMethod: oauthAuthorizeInfo.userInfo.authMethod,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: oauthAuthorizeInfo.userId,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion,
        organizationId: oauthAuthorizeInfo.userInfo.orgId,
        isMfaVerified: true,
        mcp: {
          endpointId: oauthAuthorizeInfo.endpointId
        }
      },
      appCfg.AUTH_SECRET,
      { expiresIn: oauthAuthorizeInfo.expiry }
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ms(oauthAuthorizeInfo.expiry) / 1000),
      scope: "openid"
    };
  };

  // Get servers that require personal authentication for an endpoint
  const getServersRequiringAuth = async ({
    endpointId,
    userId
  }: TGetServersRequiringAuthDTO): Promise<TServerAuthStatus[]> => {
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    // Get connected servers
    const connectedServerLinks = await aiMcpEndpointServerDAL.find({ aiMcpEndpointId: endpointId });
    const serverIds = connectedServerLinks.map((link) => link.aiMcpServerId);

    if (serverIds.length === 0) {
      return [];
    }

    // Get server details
    const servers = await Promise.all(serverIds.map((id) => aiMcpServerDAL.findById(id)));
    const validServers = servers.filter((s) => s !== null && s !== undefined);

    // Filter to only servers with personal credential mode
    const personalServers = validServers.filter((s) => s.credentialMode === AiMcpServerCredentialMode.PERSONAL);

    if (personalServers.length === 0) {
      return [];
    }

    // Check which servers the user already has credentials for
    const serversWithAuthStatus = await Promise.all(
      personalServers.map(async (server) => {
        const existingCredential = await aiMcpServerUserCredentialDAL.findByUserAndServer(userId, server.id);

        return {
          id: server.id,
          name: server.name,
          url: server.url,
          hasCredentials: Boolean(existingCredential)
        };
      })
    );

    return serversWithAuthStatus;
  };

  // Initiate OAuth for a server (personal credential mode)
  const initiateServerOAuth = async ({
    endpointId,
    serverId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TInitiateServerOAuthDTO) => {
    // Verify endpoint exists and server is connected
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    if (server.credentialMode !== AiMcpServerCredentialMode.PERSONAL) {
      throw new BadRequestError({ message: "This server does not use personal credentials" });
    }

    // Get stored OAuth config (client ID/secret) if available
    const oauthConfig = await aiMcpServerService.getServerOAuthConfig(serverId);

    // Use the existing MCP server OAuth initiate with stored client credentials
    return aiMcpServerService.initiateOAuth({
      projectId: endpoint.projectId,
      url: server.url,
      actorId,
      actor,
      actorAuthMethod,
      actorOrgId,
      clientId: oauthConfig?.clientId,
      clientSecret: oauthConfig?.clientSecret
    });
  };

  // Save user credentials after OAuth completes
  const saveUserServerCredential = async ({
    endpointId,
    serverId,
    userId,
    accessToken,
    refreshToken,
    expiresAt,
    tokenType
  }: TSaveUserServerCredentialDTO) => {
    // Verify endpoint and server exist
    const endpoint = await aiMcpEndpointDAL.findById(endpointId);
    if (!endpoint) {
      throw new NotFoundError({ message: `MCP endpoint with ID '${endpointId}' not found` });
    }

    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    // Encrypt the credentials
    const credentials = {
      accessToken,
      refreshToken,
      expiresAt,
      tokenType: tokenType || "Bearer"
    };

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: endpoint.projectId
    });

    const encryptedCredentials = encryptor({
      plainText: Buffer.from(JSON.stringify(credentials))
    }).cipherTextBlob;

    // Upsert the credential
    await aiMcpServerUserCredentialDAL.upsertCredential({
      userId,
      aiMcpServerId: serverId,
      encryptedCredentials
    });

    return { success: true };
  };

  return {
    interactWithMcp,
    createMcpEndpoint,
    listMcpEndpoints,
    getMcpEndpointById,
    updateMcpEndpoint,
    deleteMcpEndpoint,
    listEndpointTools,
    enableEndpointTool,
    disableEndpointTool,
    bulkUpdateEndpointTools,
    oauthRegisterClient,
    oauthAuthorizeClient,
    oauthFinalize,
    oauthTokenExchange,
    getServersRequiringAuth,
    initiateServerOAuth,
    saveUserServerCredential
  };
};
