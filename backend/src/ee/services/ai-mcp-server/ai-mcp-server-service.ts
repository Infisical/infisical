import crypto from "node:crypto";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TAiMcpServerDALFactory } from "./ai-mcp-server-dal";
import { AiMcpServerStatus } from "./ai-mcp-server-enum";
import {
  TAiMcpServerCredentials,
  TCreateAiMcpServerDTO,
  TGetOAuthStatusDTO,
  THandleOAuthCallbackDTO,
  TInitiateOAuthDTO,
  TOAuthAuthorizationServerMetadata,
  TOAuthDynamicClientMetadata,
  TOAuthSession,
  TOAuthTokenResponse
} from "./ai-mcp-server-types";

type TAiMcpServerServiceFactoryDep = {
  aiMcpServerDAL: TAiMcpServerDALFactory;
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

export const aiMcpServerServiceFactory = ({ aiMcpServerDAL, kmsService, keyStore }: TAiMcpServerServiceFactoryDep) => {
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

    return server;
  };

  const listMcpServers = async ({ projectId }: { projectId: string }) => {
    const servers = await aiMcpServerDAL.find({ projectId });
    return servers;
  };

  const deleteMcpServer = async ({ serverId }: { serverId: string }) => {
    const server = await aiMcpServerDAL.findById(serverId);
    if (!server) {
      throw new NotFoundError({ message: `MCP server with ID '${serverId}' not found` });
    }

    await aiMcpServerDAL.deleteById(serverId);
    return server;
  };

  return {
    initiateOAuth,
    handleOAuthCallback,
    getOAuthStatus,
    createMcpServer,
    listMcpServers,
    deleteMcpServer
  };
};
