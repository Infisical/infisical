import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - MCP SDK uses ESM with .js extensions which don't resolve types with moduleResolution: "Node"
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - MCP SDK uses ESM with .js extensions which don't resolve types with moduleResolution: "Node"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import axios, { AxiosError } from "axios";

import { ActionProjectType } from "@app/db/schemas";
import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAiMcpServerDALFactory } from "./ai-mcp-server-dal";
import { AiMcpServerCredentialMode, AiMcpServerStatus } from "./ai-mcp-server-enum";
import { TAiMcpServerToolDALFactory } from "./ai-mcp-server-tool-dal";
import {
  TAiMcpServerCredentials,
  TCreateAiMcpServerDTO,
  TDeleteMcpServerDTO,
  TGetMcpServerByIdDTO,
  TGetOAuthStatusDTO,
  THandleOAuthCallbackDTO,
  TInitiateOAuthDTO,
  TListMcpServersDTO,
  TListMcpServerToolsDTO,
  TOAuthAuthorizationServerMetadata,
  TOAuthDynamicClientMetadata,
  TOAuthProtectedResourceMetadata,
  TOAuthSession,
  TOAuthTokenResponse,
  TSyncMcpServerToolsDTO,
  TUpdateAiMcpServerDTO
} from "./ai-mcp-server-types";
import { TAiMcpServerUserCredentialDALFactory } from "./ai-mcp-server-user-credential-dal";

type TAiMcpServerServiceFactoryDep = {
  aiMcpServerDAL: TAiMcpServerDALFactory;
  aiMcpServerToolDAL: TAiMcpServerToolDALFactory;
  aiMcpServerUserCredentialDAL: TAiMcpServerUserCredentialDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAiMcpServerServiceFactory = ReturnType<typeof aiMcpServerServiceFactory>;

const OAUTH_SESSION_TTL_SECONDS = 10 * 60; // 10 minutes

// Buffer time before token expiry to trigger refresh (5 minutes)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Refresh an OAuth access token using the refresh token
 */
const refreshOAuthToken = async (
  serverUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }> => {
  const serverUrlObj = new URL(serverUrl);

  // Try both URL formats - some servers use origin-only, others use origin + pathname
  let serverMetadata: TOAuthAuthorizationServerMetadata;

  try {
    // First try: origin-only format
    const originOnlyUrl = `${serverUrlObj.origin}/.well-known/oauth-authorization-server`;
    const { data } = await request.get<TOAuthAuthorizationServerMetadata>(originOnlyUrl);
    serverMetadata = data;
  } catch {
    // Second try: origin + pathname format
    const pathnameUrl = `${serverUrlObj.origin}/.well-known/oauth-authorization-server${serverUrlObj.pathname !== "/" ? serverUrlObj.pathname : ""}`;
    const { data } = await request.get<TOAuthAuthorizationServerMetadata>(pathnameUrl);
    serverMetadata = data;
  }

  const tokenParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  };

  // Add client_secret for confidential clients
  if (clientSecret) {
    tokenParams.client_secret = clientSecret;
  }

  const { data: tokenResponse } = await request.post<TOAuthTokenResponse>(
    serverMetadata.token_endpoint,
    new URLSearchParams(tokenParams).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined
  };
};

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
  aiMcpServerUserCredentialDAL,
  kmsService,
  keyStore,
  permissionService
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
   * Parse WWW-Authenticate header to extract resource_metadata URL
   * Format: Bearer resource_metadata="https://..."
   */
  const parseWwwAuthenticateHeader = (header: string): string | null => {
    const match = header.match(/resource_metadata="([^"]+)"/);
    return match ? match[1] : null;
  };

  /**
   * Discover OAuth metadata by following the RFC 9728 Protected Resource Metadata flow:
   * 1. Try to access the MCP server URL → get 401 with WWW-Authenticate header
   * 2. Parse the protected resource metadata URL from the header
   * 3. Fetch the protected resource metadata to get authorization_servers
   * 4. Fetch the authorization server metadata
   */
  const discoverOAuthMetadata = async (
    mcpUrl: string
  ): Promise<{
    protectedResource: TOAuthProtectedResourceMetadata;
    authServer: TOAuthAuthorizationServerMetadata;
  }> => {
    let resourceMetadataUrl: string | null = null;

    const url = new URL(mcpUrl);
    await verifyHostInputValidity(url.hostname, true);

    // 1. Try to access the MCP server to get WWW-Authenticate header
    try {
      await request.get(mcpUrl);
      // If we get here without error, the server doesn't require auth (unusual)
      throw new BadRequestError({
        message: "MCP server did not return authentication requirements"
      });
    } catch (error) {
      // Check if it's an axios error with 401 status
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError;
        if (axiosErr.response?.status === 401) {
          const wwwAuth = axiosErr.response.headers["www-authenticate"] as string | undefined;
          if (wwwAuth) {
            resourceMetadataUrl = parseWwwAuthenticateHeader(wwwAuth);
          }
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const urlObj = new URL(mcpUrl);

    if (!resourceMetadataUrl) {
      // Fallback: Try common .well-known paths
      const possiblePaths = [
        `${urlObj.origin}/.well-known/oauth-protected-resource${urlObj.pathname}`,
        `${urlObj.origin}/.well-known/oauth-protected-resource`
      ];

      // Try paths sequentially (using Promise.allSettled would change semantics)
      // eslint-disable-next-line no-restricted-syntax
      for (const path of possiblePaths) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const { data } = await request.get<TOAuthProtectedResourceMetadata>(path);
          if (data.authorization_servers?.length > 0) {
            resourceMetadataUrl = path;
            break;
          }
        } catch {
          // Continue to next path
        }
      }
    }

    if (!resourceMetadataUrl) {
      // Fallback: Try auth server metadata directly (for servers like Linear
      // that don't support RFC 9728 Protected Resource Metadata)
      try {
        const authServerMetadataUrl = `${urlObj.origin}/.well-known/oauth-authorization-server`;
        const { data: authServer } = await request.get<TOAuthAuthorizationServerMetadata>(authServerMetadataUrl);
        if (authServer.authorization_endpoint && authServer.token_endpoint) {
          return {
            protectedResource: {
              resource: mcpUrl,
              authorization_servers: [urlObj.origin]
            } as TOAuthProtectedResourceMetadata,
            authServer
          };
        }
      } catch (err) {
        // Log non-404 errors for debugging, but still fall through
        if (!axios.isAxiosError(err) || err.response?.status !== 404) {
          logger.warn(err, "Failed to fetch OAuth authorization server metadata");
        }
      }

      throw new BadRequestError({
        message: "Could not discover OAuth metadata for MCP server."
      });
    }

    // 2. Fetch protected resource metadata
    const { data: protectedResource } = await request.get<TOAuthProtectedResourceMetadata>(resourceMetadataUrl);

    if (!protectedResource.authorization_servers?.length) {
      throw new BadRequestError({
        message: "Protected resource metadata does not specify any authorization servers"
      });
    }

    // 3. Get the authorization server URL and fetch its metadata
    const authServerUrl = protectedResource.authorization_servers[0];
    const authServerUrlObj = new URL(authServerUrl);

    // Try both URL formats - some servers use origin-only, others use origin + pathname
    let authServer: TOAuthAuthorizationServerMetadata;

    try {
      // First try: origin-only format
      const originOnlyUrl = `${authServerUrlObj.origin}/.well-known/oauth-authorization-server`;
      const { data } = await request.get<TOAuthAuthorizationServerMetadata>(originOnlyUrl);
      authServer = data;
    } catch {
      // Second try: origin + pathname format
      const pathnameUrl = `${authServerUrlObj.origin}/.well-known/oauth-authorization-server${authServerUrlObj.pathname !== "/" ? authServerUrlObj.pathname : ""}`;
      const { data } = await request.get<TOAuthAuthorizationServerMetadata>(pathnameUrl);
      authServer = data;
    }

    return { protectedResource, authServer };
  };

  /**
   * Initiate OAuth flow for MCP server
   * Returns the authorization URL and session ID
   * Supports both DCR (Dynamic Client Registration) and hardcoded client credentials
   */
  const initiateOAuth = async ({
    projectId,
    url,
    actorId,
    clientId,
    clientSecret,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TInitiateOAuthDTO) => {
    const appCfg = getConfig();

    // Check permissions only when actor context is provided (called from router)
    if (actor && actorAuthMethod && actorOrgId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor as ActorType,
        actorId,
        projectId,
        actorAuthMethod: actorAuthMethod as AuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.AI
      });

      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.McpServers);
    }

    const urlObj = new URL(url);
    await verifyHostInputValidity(urlObj.hostname, true);

    // 1. Discover OAuth metadata following RFC 9728 flow
    const { protectedResource, authServer } = await discoverOAuthMetadata(url);

    // 2. Generate session ID
    const sessionId = crypto.randomUUID();

    // 3. Build redirect URI
    const redirectUri = `${appCfg.SITE_URL}/api/v1/ai/mcp/servers/oauth/callback`;

    // 4. Get client credentials - either from DCR or hardcoded
    let resolvedClientId: string;
    let resolvedClientSecret: string | undefined;

    if (clientId) {
      // Use hardcoded client credentials (for servers like GitHub that don't support DCR)
      resolvedClientId = clientId;
      resolvedClientSecret = clientSecret;
    } else {
      // Use Dynamic Client Registration
      if (!authServer.registration_endpoint) {
        throw new BadRequestError({
          message: "MCP server does not support Dynamic Client Registration. Please provide a client ID and secret."
        });
      }

      const { data: clientMetadata } = await request.post<TOAuthDynamicClientMetadata>(
        authServer.registration_endpoint,
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

      resolvedClientId = clientMetadata.client_id;
      resolvedClientSecret = clientMetadata.client_secret;
    }

    // 5. Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    // 6. Store session data in keystore (include auth server token endpoint for callback)
    const sessionData: TOAuthSession = {
      actorId,
      codeVerifier,
      codeChallenge,
      clientId: resolvedClientId,
      clientSecret: resolvedClientSecret,
      projectId,
      serverUrl: url,
      redirectUri,
      tokenEndpoint: authServer.token_endpoint,
      authorized: false
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AiMcpServerOAuth(sessionId),
      OAUTH_SESSION_TTL_SECONDS,
      JSON.stringify(sessionData)
    );

    // 7. Build authorization URL
    const authUrl = new URL(authServer.authorization_endpoint);
    authUrl.searchParams.set("client_id", resolvedClientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");

    // Use scopes from protected resource if available, otherwise default
    const scopes = protectedResource.scopes_supported?.join(" ") || "read write";
    authUrl.searchParams.set("scope", scopes);

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

    // 2. Exchange code for tokens using the stored token endpoint
    const tokenParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: sessionData.redirectUri,
      client_id: sessionData.clientId,
      code_verifier: sessionData.codeVerifier
    };

    // Add client_secret if available
    if (sessionData.clientSecret) {
      tokenParams.client_secret = sessionData.clientSecret;
    }

    const { data: tokenResponse } = await request.post<TOAuthTokenResponse>(
      sessionData.tokenEndpoint,
      new URLSearchParams(tokenParams).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json" // GitHub returns form-urlencoded by default without this
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
  const getOAuthStatus = async ({ sessionId, actorId, actor, actorAuthMethod, actorOrgId }: TGetOAuthStatusDTO) => {
    const sessionDataStr = await keyStore.getItem(KeyStorePrefixes.AiMcpServerOAuth(sessionId));
    if (!sessionDataStr) {
      return { authorized: false };
    }

    const sessionData = JSON.parse(sessionDataStr) as TOAuthSession;

    // Verify the actor matches who initiated the OAuth flow
    if (sessionData.actorId !== actorId) {
      throw new BadRequestError({ message: "Unauthorized to access this OAuth session" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor as ActorType,
      actorId,
      projectId: sessionData.projectId,
      actorAuthMethod: actorAuthMethod as AuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.McpServers);

    if (!sessionData.authorized) {
      return { authorized: false };
    }

    return {
      authorized: true,
      accessToken: sessionData.accessToken,
      refreshToken: sessionData.refreshToken,
      expiresAt: sessionData.expiresAt,
      tokenType: sessionData.tokenType,
      clientId: sessionData.clientId,
      clientSecret: sessionData.clientSecret
    };
  };

  const createMcpServer = async ({
    projectId,
    name,
    url,
    description,
    credentialMode,
    authMethod,
    credentials,
    oauthClientId,
    oauthClientSecret,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateAiMcpServerDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.McpServers);

    const encryptedCredentials = await encryptCredentials({
      projectId,
      credentials,
      kmsService
    });

    // Encrypt OAuth config (client ID/secret) if provided
    let encryptedOauthConfig: Buffer | undefined;
    if (oauthClientId) {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      encryptedOauthConfig = encryptor({
        plainText: Buffer.from(JSON.stringify({ clientId: oauthClientId, clientSecret: oauthClientSecret }))
      }).cipherTextBlob;
    }

    const server = await aiMcpServerDAL.create({
      projectId,
      name,
      url,
      description,
      credentialMode,
      authMethod,
      encryptedCredentials,
      encryptedOauthConfig,
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

  const listMcpServers = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListMcpServersDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.McpServers);

    const servers = await aiMcpServerDAL.find({ projectId });
    return servers;
  };

  const getMcpServerById = async ({ serverId, actor, actorId, actorAuthMethod, actorOrgId }: TGetMcpServerByIdDTO) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: server.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.McpServers);

    return server;
  };

  const updateMcpServer = async (dto: TUpdateAiMcpServerDTO) => {
    const { serverId, name, description, actor, actorId, actorAuthMethod, actorOrgId } = dto;

    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: server.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.McpServers);

    const updateData: { name?: string; description?: string } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const updatedServer = await aiMcpServerDAL.updateById(serverId, updateData);

    return updatedServer;
  };

  const deleteMcpServer = async ({ serverId, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteMcpServerDTO) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: server.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.McpServers);

    await aiMcpServerDAL.deleteById(serverId);
    return server;
  };

  const listMcpServerTools = async ({
    serverId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListMcpServerToolsDTO) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: server.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.McpServers);

    const tools = await aiMcpServerToolDAL.find({ aiMcpServerId: serverId });
    return { tools, projectId: server.projectId, serverName: server.name };
  };

  const syncMcpServerTools = async ({
    serverId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSyncMcpServerToolsDTO) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: server.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.McpServers);

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
    return { tools, projectId: server.projectId, serverName: server.name };
  };

  /**
   * Get decrypted credentials for an MCP server, automatically refreshing OAuth tokens if expired.
   * This is the single source of truth for getting valid credentials.
   */
  const getServerCredentials = async ({
    serverId,
    projectId
  }: {
    serverId: string;
    projectId: string;
  }): Promise<{ credentials: TAiMcpServerCredentials; accessToken: string | undefined } | null> => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server || !server.encryptedCredentials) {
      return null;
    }

    // Create cipher pair for decryption (and encryption if we need to refresh)
    const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    let credentials = JSON.parse(
      decryptor({ cipherTextBlob: server.encryptedCredentials }).toString()
    ) as TAiMcpServerCredentials;

    // Handle OAuth credentials with potential token refresh
    if ("accessToken" in credentials) {
      const isExpired =
        "expiresAt" in credentials &&
        credentials.expiresAt &&
        Date.now() >= credentials.expiresAt - TOKEN_REFRESH_BUFFER_MS;

      if (isExpired && "refreshToken" in credentials && credentials.refreshToken) {
        // Decrypt OAuth config to get client credentials for refresh
        let oauthConfig: { clientId: string; clientSecret?: string } | undefined;
        if (server.encryptedOauthConfig) {
          oauthConfig = JSON.parse(decryptor({ cipherTextBlob: server.encryptedOauthConfig }).toString()) as {
            clientId: string;
            clientSecret?: string;
          };
        }

        if (!oauthConfig?.clientId) {
          logger.error({ serverId }, "Cannot refresh OAuth token: missing client_id in OAuth config");
        } else {
          try {
            const refreshedTokens = await refreshOAuthToken(
              server.url,
              credentials.refreshToken,
              oauthConfig.clientId,
              oauthConfig.clientSecret
            );

            credentials = {
              ...credentials,
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken || credentials.refreshToken,
              expiresAt: refreshedTokens.expiresAt
            };

            // Persist the refreshed credentials
            const { cipherTextBlob: newEncryptedCredentials } = encryptor({
              plainText: Buffer.from(JSON.stringify(credentials))
            });

            await aiMcpServerDAL.updateById(serverId, {
              encryptedCredentials: newEncryptedCredentials
            });

            logger.info({ serverId }, "Refreshed OAuth token for MCP server");
          } catch (refreshError) {
            logger.error(refreshError, `Failed to refresh OAuth token for MCP server ${serverId}`);
            // Return expired token - caller can decide how to handle the error
          }
        }
      }

      return { credentials, accessToken: credentials.accessToken };
    }

    // Handle bearer token credentials
    if ("token" in credentials) {
      return { credentials, accessToken: credentials.token };
    }

    // Basic auth or other types - no access token
    return { credentials, accessToken: undefined };
  };

  // Get stored OAuth config (client ID/secret) for a server
  const getServerOAuthConfig = async (
    serverId: string
  ): Promise<{ clientId: string; clientSecret?: string } | null> => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server || !server.encryptedOauthConfig) {
      return null;
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: server.projectId
    });

    const decrypted = decryptor({ cipherTextBlob: server.encryptedOauthConfig });
    return JSON.parse(decrypted.toString()) as { clientId: string; clientSecret?: string };
  };

  // Get user's personal credentials for a server (with token refresh)
  const getUserServerCredentials = async ({
    serverId,
    userId,
    projectId,
    serverUrl
  }: {
    serverId: string;
    userId: string;
    projectId: string;
    serverUrl: string;
  }): Promise<{ accessToken: string } | null> => {
    const userCredential = await aiMcpServerUserCredentialDAL.findByUserAndServer(userId, serverId);
    if (!userCredential) {
      return null;
    }

    // Create cipher pair for decryption (and encryption if we need to refresh)
    const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    let credentials = JSON.parse(decryptor({ cipherTextBlob: userCredential.encryptedCredentials }).toString()) as {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      tokenType?: string;
    };

    // Check if token is expired and needs refresh
    const isExpired = credentials.expiresAt && Date.now() >= credentials.expiresAt - TOKEN_REFRESH_BUFFER_MS;

    if (isExpired && credentials.refreshToken) {
      // Get OAuth config (client_id is needed for refresh)
      const oauthConfig = await getServerOAuthConfig(serverId);

      if (!oauthConfig?.clientId) {
        logger.error({ serverId, userId }, "Cannot refresh OAuth token: missing client_id in OAuth config");
      } else {
        try {
          const refreshedTokens = await refreshOAuthToken(
            serverUrl,
            credentials.refreshToken,
            oauthConfig.clientId,
            oauthConfig.clientSecret
          );

          credentials = {
            ...credentials,
            accessToken: refreshedTokens.accessToken,
            refreshToken: refreshedTokens.refreshToken || credentials.refreshToken,
            expiresAt: refreshedTokens.expiresAt
          };

          // Persist the refreshed credentials
          const { cipherTextBlob: newEncryptedCredentials } = encryptor({
            plainText: Buffer.from(JSON.stringify(credentials))
          });

          await aiMcpServerUserCredentialDAL.upsertCredential({
            userId,
            aiMcpServerId: serverId,
            encryptedCredentials: newEncryptedCredentials
          });

          logger.info({ serverId, userId }, "Refreshed OAuth token for user's MCP server credentials");
        } catch (refreshError) {
          logger.error(refreshError, `Failed to refresh OAuth token for user ${userId} on MCP server ${serverId}`);
          // Return expired token - caller can decide how to handle the error
        }
      }
    }

    return { accessToken: credentials.accessToken };
  };

  // Unified method to get credentials based on credential mode
  const getCredentialsForServer = async ({
    serverId,
    serverUrl,
    credentialMode,
    projectId,
    userId
  }: {
    serverId: string;
    serverUrl: string;
    credentialMode?: string | null;
    projectId: string;
    userId: string;
  }): Promise<{ accessToken?: string } | null> => {
    if (credentialMode === AiMcpServerCredentialMode.PERSONAL) {
      return getUserServerCredentials({ serverId, userId, projectId, serverUrl });
    }
    return getServerCredentials({ serverId, projectId });
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
    syncMcpServerTools,
    getCredentialsForServer,
    getServerOAuthConfig
  };
};
