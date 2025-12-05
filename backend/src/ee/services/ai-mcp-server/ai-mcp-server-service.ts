import crypto from "node:crypto";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - MCP SDK uses ESM with .js extensions which don't resolve types with moduleResolution: "Node"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - MCP SDK uses ESM with .js extensions which don't resolve types with moduleResolution: "Node"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TAiMcpServerDALFactory } from "./ai-mcp-server-dal";
import { AiMcpServerStatus } from "./ai-mcp-server-enum";
import { TAiMcpServerToolDALFactory } from "./ai-mcp-server-tool-dal";
import {
  TAiMcpServerCredentials,
  TCreateAiMcpServerDTO,
  TGetOAuthStatusDTO,
  THandleOAuthCallbackDTO,
  TInitiateOAuthDTO,
  TOAuthAuthorizationServerMetadata,
  TOAuthDynamicClientMetadata,
  TOAuthSession,
  TOAuthTokenResponse,
  TUpdateAiMcpServerDTO
} from "./ai-mcp-server-types";

type TAiMcpServerServiceFactoryDep = {
  aiMcpServerDAL: TAiMcpServerDALFactory;
  aiMcpServerToolDAL: TAiMcpServerToolDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

export type TAiMcpServerServiceFactory = ReturnType<typeof aiMcpServerServiceFactory>;

const OAUTH_SESSION_TTL_SECONDS = 10 * 60; // 10 minutes

// Helper to encrypt credentials
const encryptCredentials = async ({
  projectId,
  credentials,
  kmsService
}: {
  projectId: string;
  credentials: TAiMcpServerCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(credentials))
  });

  return cipherTextBlob;
};

// MCP tool type from the SDK response
type TMcpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export const aiMcpServerServiceFactory = ({
  aiMcpServerDAL,
  aiMcpServerToolDAL,
  kmsService,
  keyStore
}: TAiMcpServerServiceFactoryDep) => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
  const fetchMcpTools = async (serverUrl: string, accessToken: string): Promise<TMcpTool[]> => {
    let client: Client | undefined;
    try {
      client = new Client({
        name: "infisical-mcp-client",
        version: "1.0.0"
      });

      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      });

      await client.connect(transport);
      const { tools } = await client.listTools();

      return tools.map((tool: { name: string; description?: string; inputSchema?: unknown }) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown> | undefined
      }));
    } catch (error) {
      // Log but don't fail - tools can be fetched later
      logger.error(error, "Failed to fetch tools from MCP server");
      return [];
    } finally {
      if (client) {
        await client.close();
      }
    }
  };
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */

  /**
   * Initiate OAuth flow for MCP server
   * Returns the authorization URL and session ID
   */
  const initiateOAuth = async ({ projectId, url, actorId }: TInitiateOAuthDTO) => {
    const appCfg = getConfig();
    const issuer = new URL(url).origin;

    // 1. Get OAuth metadata from the MCP server
    const { data: serverMetadata } = await request.get<TOAuthAuthorizationServerMetadata>(
      `${issuer}/.well-known/oauth-authorization-server`
    );

    if (!serverMetadata.registration_endpoint) {
      throw new BadRequestError({
        message: "MCP server does not support Dynamic Client Registration"
      });
    }

    // 2. Generate session ID
    const sessionId = crypto.randomUUID();

    // 3. Build redirect URI
    const redirectUri = `${appCfg.SITE_URL}/api/v1/ai/mcp-servers/oauth/callback`;

    // 4. Register client via DCR
    const { data: clientMetadata } = await request.post<TOAuthDynamicClientMetadata>(
      serverMetadata.registration_endpoint,
      {
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        client_name: `Infisical MCP Client - ${actorId}`
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    // 5. Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    // 6. Store session data in keystore
    const sessionData: TOAuthSession = {
      actorId,
      codeVerifier,
      codeChallenge,
      clientId: clientMetadata.client_id,
      projectId,
      serverUrl: url,
      redirectUri,
      authorized: false
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpServerOAuth(sessionId),
      OAUTH_SESSION_TTL_SECONDS,
      JSON.stringify(sessionData)
    );

    // 7. Build authorization URL
    const authUrl = new URL(serverMetadata.authorization_endpoint);
    authUrl.searchParams.set("client_id", clientMetadata.client_id);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "read write");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", sessionId);

    return {
      authUrl: authUrl.toString(),
      sessionId
    };
  };

  /**
   * Handle OAuth callback from MCP server
   * Exchanges authorization code for tokens
   */
  const handleOAuthCallback = async ({ sessionId, code }: THandleOAuthCallbackDTO) => {
    // 1. Get session data from keystore
    const sessionDataStr = await keyStore.getItem(KeyStorePrefixes.AiMcpServerOAuth(sessionId));
    if (!sessionDataStr) {
      throw new BadRequestError({
        message: "OAuth session not found or expired. Please try again."
      });
    }

    const sessionData = JSON.parse(sessionDataStr) as TOAuthSession;

    if (sessionData.authorized) {
      throw new BadRequestError({
        message: "OAuth session already authorized"
      });
    }

    // 2. Get OAuth metadata again
    const issuer = new URL(sessionData.serverUrl).origin;
    const { data: serverMetadata } = await request.get<TOAuthAuthorizationServerMetadata>(
      `${issuer}/.well-known/oauth-authorization-server`
    );

    // 3. Exchange code for tokens
    const { data: tokenResponse } = await request.post<TOAuthTokenResponse>(
      serverMetadata.token_endpoint,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: sessionData.redirectUri,
        client_id: sessionData.clientId,
        code_verifier: sessionData.codeVerifier
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // 4. Update session with tokens
    const updatedSession: TOAuthSession = {
      ...sessionData,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
      tokenType: tokenResponse.token_type,
      authorized: true
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpServerOAuth(sessionId),
      OAUTH_SESSION_TTL_SECONDS,
      JSON.stringify(updatedSession)
    );

    return { success: true, projectId: sessionData.projectId };
  };

  /**
   * Get OAuth status for a session
   */
  const getOAuthStatus = async ({ sessionId, actorId }: TGetOAuthStatusDTO) => {
    const sessionDataStr = await keyStore.getItem(KeyStorePrefixes.AiMcpServerOAuth(sessionId));
    if (!sessionDataStr) {
      return { authorized: false };
    }

    const sessionData = JSON.parse(sessionDataStr) as TOAuthSession;

    // Verify the actor matches who initiated the OAuth flow
    if (sessionData.actorId !== actorId) {
      throw new BadRequestError({ message: "Unauthorized to access this OAuth session" });
    }

    if (!sessionData.authorized) {
      return { authorized: false };
    }

    return {
      authorized: true,
      accessToken: sessionData.accessToken,
      refreshToken: sessionData.refreshToken,
      expiresAt: sessionData.expiresAt,
      tokenType: sessionData.tokenType
    };
  };

  const createMcpServer = async ({
    projectId,
    name,
    url,
    description,
    credentialMode,
    authMethod,
    credentials
  }: TCreateAiMcpServerDTO) => {
    const encryptedCredentials = await encryptCredentials({
      projectId,
      credentials,
      kmsService
    });

    const server = await aiMcpServerDAL.create({
      projectId,
      name,
      url,
      description,
      credentialMode,
      authMethod,
      encryptedCredentials,
      status: AiMcpServerStatus.ACTIVE
    });

    // Fetch and store tools from MCP server
    // Get access token from credentials (for OAuth or Bearer auth)
    let accessToken: string | undefined;
    if ("accessToken" in credentials) {
      accessToken = credentials.accessToken;
    } else if ("token" in credentials) {
      accessToken = credentials.token;
    }

    if (accessToken) {
      const tools = await fetchMcpTools(url, accessToken);

      if (tools.length > 0) {
        await aiMcpServerToolDAL.insertMany(
          tools.map((tool) => ({
            aiMcpServerId: server.id,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        );
      }
    }

    return server;
  };

  const listMcpServers = async ({ projectId }: { projectId: string }) => {
    const servers = await aiMcpServerDAL.find({ projectId });
    return servers;
  };

  const getMcpServerById = async ({ serverId }: { serverId: string }) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }
    return server;
  };

  const updateMcpServer = async (dto: TUpdateAiMcpServerDTO) => {
    const { serverId, name, description } = dto;

    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const updateData: { name?: string; description?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedServer = await aiMcpServerDAL.updateById(serverId, updateData);

    return updatedServer;
  };

  const deleteMcpServer = async ({ serverId }: { serverId: string }) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    await aiMcpServerDAL.deleteById(serverId);
    return server;
  };

  const listMcpServerTools = async ({ serverId }: { serverId: string }) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const tools = await aiMcpServerToolDAL.find({ aiMcpServerId: serverId });
    return tools;
  };

  const syncMcpServerTools = async ({ serverId }: { serverId: string }) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    if (!server.encryptedCredentials) {
      throw new BadRequestError({ message: "Server credentials not found" });
    }

    // Decrypt credentials to get access token
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: server.projectId
    });

    const decryptedCredentials = JSON.parse(
      decryptor({ cipherTextBlob: server.encryptedCredentials }).toString()
    ) as TAiMcpServerCredentials;

    // Get access token from credentials
    let accessToken: string | undefined;
    if ("accessToken" in decryptedCredentials) {
      accessToken = decryptedCredentials.accessToken;
    } else if ("token" in decryptedCredentials) {
      accessToken = decryptedCredentials.token;
    }

    if (!accessToken) {
      throw new BadRequestError({ message: "No access token available for this server" });
    }

    // Fetch tools from MCP server
    const fetchedTools = await fetchMcpTools(server.url, accessToken);

    // Delete existing tools
    await aiMcpServerToolDAL.delete({ aiMcpServerId: serverId });

    // Insert new tools
    if (fetchedTools.length > 0) {
      await aiMcpServerToolDAL.insertMany(
        fetchedTools.map((tool) => ({
          aiMcpServerId: serverId,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      );
    }

    // Return the newly inserted tools
    const tools = await aiMcpServerToolDAL.find({ aiMcpServerId: serverId });
    return tools;
  };

  return {
    initiateOAuth,
    handleOAuthCallback,
    getOAuthStatus,
    createMcpServer,
    getMcpServerById,
    updateMcpServer,
    listMcpServers,
    deleteMcpServer,
    listMcpServerTools,
    syncMcpServerTools
  };
};
