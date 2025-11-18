import crypto from "node:crypto";

import { subject } from "@casl/ability";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server as RawMcpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto as cryptoModule } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ProjectServiceActor } from "@app/lib/types";
import { AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamMcpServerConfiguration } from "../pam-account/pam-mcp-server-service";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import { TMcpAccountCredentials, TMcpResourceConnectionDetails } from "../pam-resource/mcp/mcp-resource-types";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamSessionCommandLog } from "../pam-session/pam-session.types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionPamAccountActions, ProjectPermissionSub } from "../permission/project-permission";
import {
  TOauthAuthorizeClient,
  TOauthAuthorizeClientScope,
  TOauthRegisterClient,
  TOauthTokenExchangeDTO
} from "./pam-mcp-types";

const DynamicClientInfoSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.string()),
  client_name: z.string(),
  client_uri: z.string(),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
  token_endpoint_auth_method: z.string(),
  client_id_issued_at: z.number()
});

const OauthChallengeCodeSchema = z.object({
  codeChallenge: z.string(),
  codeChallengeMethod: z.string(),
  userId: z.string(),
  scope: z.string(),
  state: z.string().optional(),
  projectId: z.string(),
  path: z.string().optional(),
  redirectUri: z.string(),
  userInfo: z.object({
    tokenId: z.string(),
    orgId: z.string(),
    authMethod: z.string()
  })
});

export const computePkceChallenge = (codeVerifier: string) => {
  // TODO(pam-mcp): switch to crypto module
  const sha256 = crypto.createHash("sha256").update(codeVerifier).digest();

  return Buffer.from(sha256).toString("base64url");
};

type TPamMcpServiceFactoryDep = {
  // pamMcpDAL: TPamMcpDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  authTokenService: Pick<TAuthTokenServiceFactory, "getUserTokenSessionById" | "validateRefreshToken">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  pamResourceDAL: TPamResourceDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamFolderDAL: TPamFolderDALFactory;
  pamSessionDAL: TPamSessionDALFactory;
};

export type TPamMcpServiceFactory = ReturnType<typeof pamMcpServiceFactory>;

const OAUTH_FLOW_EXPIRY_IN_SECS = 5 * 60;
export const pamMcpServiceFactory = ({
  keyStore,
  permissionService,
  authTokenService,
  pamAccountDAL,
  pamResourceDAL,
  pamFolderDAL,
  kmsService,
  pamSessionDAL
}: TPamMcpServiceFactoryDep) => {
  const interactWithMcp = async (actor: ProjectServiceActor, projectId: string, sessionId: string) => {
    const appCfg = getConfig();

    const mcpResources = await pamResourceDAL.find({
      resourceType: PamResource.Mcp,
      projectId
    });

    const mcpAccounts = await pamAccountDAL.find({
      projectId,
      $in: {
        resourceId: mcpResources.map((el) => el.id)
      }
    });

    const accountPathFn = await getFullPamFolderPath({
      pamFolderDAL,
      projectId
    });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const allowedMcpAccounts = mcpAccounts.filter((account) => {
      const resource = mcpResources.find((el) => el.id === account.resourceId);
      const accountPath = accountPathFn({ folderId: account.folderId });
      if (!resource) return false;
      return permission.can(
        ProjectPermissionPamAccountActions.Access,
        subject(ProjectPermissionSub.PamAccounts, {
          resourceName: resource.name,
          accountName: account.name,
          accountPath
        })
      );
    });

    const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const mcpClientTools = await Promise.all(
      allowedMcpAccounts.map(async (mcpAccount) => {
        const resource = mcpResources.find((el) => el.id === mcpAccount.resourceId)!;
        const connectionDetails = JSON.parse(
          decryptor({
            cipherTextBlob: resource.encryptedConnectionDetails
          }).toString()
        ) as TMcpResourceConnectionDetails;

        const decryptedCredentials = JSON.parse(
          decryptor({
            cipherTextBlob: mcpAccount.encryptedCredentials
          }).toString()
        ) as TMcpAccountCredentials;

        const accountConfiguration = mcpAccount.config as TPamMcpServerConfiguration;

        const client = new Client({
          name: `infisical-pam-client-${mcpAccount.name}`,
          version: "1.0.0"
        });
        const headers = Object.fromEntries((decryptedCredentials?.headers || []).map((el) => [el.key, el.value]));
        if (decryptedCredentials.token?.accessToken) {
          headers.Authorization = `Bearer ${decryptedCredentials.token?.accessToken}`;
        }
        const transport = new StreamableHTTPClientTransport(new URL(connectionDetails.url), {
          requestInit: {
            headers
          }
        });
        await client.connect(transport);
        // handle pagination later
        const { tools } = await client.listTools();
        return {
          client,
          account: mcpAccount,
          tools: tools.filter((el) => accountConfiguration?.statement?.toolsAllowed?.includes(el.name))
        };
      })
    );

    const server = new RawMcpServer(
      {
        name: "infisical-server",
        version: appCfg.INFISICAL_PLATFORM_VERSION || "0.0.1"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    // Handle ListTools request
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: mcpClientTools.flatMap((el) => el.tools)
    }));

    // Handle CallTool request
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Find the tool in our loaded tools
      const selectMcpClient = mcpClientTools.find((el) => el.tools.find((t) => t.name === name));
      if (!selectMcpClient) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        const result = await selectMcpClient.client.callTool({
          name,
          arguments: args
        });

        const session = await pamSessionDAL.findById(sessionId);
        // TODO(pam-mcp): make it concurrent
        const decryptedBlob = session?.encryptedLogsBlob
          ? (JSON.parse(
              decryptor({
                cipherTextBlob: session?.encryptedLogsBlob
              }).toString()
            ) as TPamSessionCommandLog[])
          : [];

        decryptedBlob.push({
          timestamp: new Date(),
          output: JSON.stringify(result, null, 2),
          input: JSON.stringify({ accountName: selectMcpClient.account.name, name, args }, null, 2)
        });

        const encryptedLogsBlob = encryptor({
          plainText: Buffer.from(JSON.stringify(decryptedBlob))
        }).cipherTextBlob;
        await pamSessionDAL.updateById(sessionId, { encryptedLogsBlob, status: PamSessionStatus.Active });
        return result;
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

  const oauthRegisterClient = async ({
    client_name,
    client_uri,
    grant_types,
    redirect_uris,
    response_types,
    token_endpoint_auth_method
  }: TOauthRegisterClient) => {
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

    // TODO(pam-mcp): validate redirect uris
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.PamMcpOauthSessionClient(clientId),
      OAUTH_FLOW_EXPIRY_IN_SECS,
      JSON.stringify(payload)
    );
    return payload;
  };

  const oauthAuthorizeClient = async ({ clientId }: TOauthAuthorizeClient) => {
    const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.PamMcpOauthSessionClient(clientId));
    if (!oauthClientCache) {
      throw new UnauthorizedError({ message: `Mcp oauth client with id ${clientId} not found` });
    }
  };

  const oauthAuthorizeClientScope = async ({
    clientId,
    permission,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    projectId,
    path = "/",
    scope,
    state,
    tokenId
  }: TOauthAuthorizeClientScope) => {
    const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.PamMcpOauthSessionClient(clientId));
    if (!oauthClientCache) {
      throw new UnauthorizedError({ message: `Mcp oauth client with id ${clientId} not found` });
    }

    const oauthClient = await DynamicClientInfoSchema.parseAsync(JSON.parse(oauthClientCache));
    const isValidRedirectUri = oauthClient.redirect_uris.some((el) => new URL(el).toString() === redirectUri);
    if (!isValidRedirectUri) throw new BadRequestError({ message: "Redirect URI mismatch" });

    await permissionService.getProjectPermission({
      actor: permission.type,
      actorAuthMethod: permission.authMethod,
      actorId: permission.id,
      actorOrgId: permission.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const code = crypto.randomBytes(32).toString("hex");
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.PamMcpOauthSessionCode(clientId, code),
      OAUTH_FLOW_EXPIRY_IN_SECS,
      JSON.stringify({
        codeChallenge,
        codeChallengeMethod,
        userId: permission.id,
        state,
        projectId,
        scope,
        path,
        redirectUri,
        userInfo: {
          tokenId,
          orgId: permission.orgId,
          authMethod: permission.authMethod
        }
      })
    );

    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (!state) url.searchParams.set("state", String(state));
    return url;
  };

  // TODO(pam-mcp): think about it as a seperate token
  const oauthTokenExchange = async (dto: TOauthTokenExchangeDTO) => {
    const appCfg = getConfig();

    if (dto.grant_type === "authorization_code") {
      const oauthClientCache = await keyStore.getItem(KeyStorePrefixes.PamMcpOauthSessionClient(dto.client_id));
      if (!oauthClientCache) {
        throw new UnauthorizedError({ message: `Mcp oauth client with id ${dto.client_id} not found` });
      }

      const oauthClient = await DynamicClientInfoSchema.parseAsync(JSON.parse(oauthClientCache));

      const oauthAuthorizeSessionCache = await keyStore.getItem(
        KeyStorePrefixes.PamMcpOauthSessionCode(dto.client_id, dto.code)
      );
      if (!oauthAuthorizeSessionCache) {
        throw new UnauthorizedError({ message: `Mcp oauth session not found` });
      }
      const oauthAuthorizeInfo = await OauthChallengeCodeSchema.parseAsync(JSON.parse(oauthAuthorizeSessionCache));
      const isInvalidRedirectUri = dto.redirect_uri !== oauthAuthorizeInfo.redirectUri;
      if (isInvalidRedirectUri) throw new BadRequestError({ message: "Redirect URI mismatch" });

      // One-time use code
      await keyStore.deleteItem(KeyStorePrefixes.PamMcpOauthSessionCode(dto.client_id, dto.code));

      const challenge = computePkceChallenge(dto.code_verifier);
      if (challenge !== oauthAuthorizeInfo.codeChallenge) throw new BadRequestError({ message: "Challenge mismatch" });

      const tokenSession = await authTokenService.getUserTokenSessionById(
        oauthAuthorizeInfo.userInfo.tokenId,
        oauthAuthorizeInfo.userId
      );
      if (!tokenSession) throw new UnauthorizedError({ message: "User session not found" });
      const mcpSession = await pamSessionDAL.create({
        accountName: oauthClient.client_id,
        // actorEmail: oauthAuthorizeInfo.userInfo.actorEmail,
        // actorIp: oauthAuthorizeInfo.userInfo.actorIp,
        // actorName: oauthAuthorizeInfo.userInfo.actorIp,
        // actorUserAgent: oauthAuthorizeInfo.userInfo.actorIp,
        actorEmail: "test@localhost.local",
        actorIp: "192.0.0.1",
        actorName: "tester",
        actorUserAgent: "firefox/blade",
        projectId: oauthAuthorizeInfo.projectId,
        resourceName: "MCP",
        resourceType: PamResource.Mcp,
        status: PamSessionStatus.Starting,
        userId: oauthAuthorizeInfo.userId,
        expiresAt: new Date(Date.now() + ms("4hr"))
      });

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
            projectId: oauthAuthorizeInfo.projectId,
            path: oauthAuthorizeInfo.path,
            sessionId: mcpSession.id
          }
        },
        appCfg.AUTH_SECRET,
        { expiresIn: appCfg.JWT_AUTH_LIFETIME }
      );

      // TODO(pam-mcp): expires in can be org set one as well
      const refreshToken = cryptoModule.jwt().sign(
        {
          authMethod: oauthAuthorizeInfo.userInfo.authMethod,
          authTokenType: AuthTokenType.REFRESH_TOKEN,
          userId: oauthAuthorizeInfo.userId,
          tokenVersionId: tokenSession.id,
          refreshVersion: tokenSession.refreshVersion,
          organizationId: oauthAuthorizeInfo.userInfo.orgId,
          isMfaVerified: true,
          mcp: {
            projectId: oauthAuthorizeInfo.projectId,
            path: oauthAuthorizeInfo.path
          }
        },
        appCfg.AUTH_SECRET,
        { expiresIn: appCfg.JWT_REFRESH_LIFETIME }
      );

      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(ms(appCfg.JWT_AUTH_LIFETIME) / 1000),
        refresh_token: refreshToken,
        scope: "openid"
      };
    }

    const { decodedToken, tokenVersion } = await authTokenService.validateRefreshToken(dto.refresh_token);
    if (!decodedToken?.mcp)
      throw new BadRequestError({ message: "Invalid refresh token. Re-login to use mcp refresh token" });

    const accessToken = cryptoModule.jwt().sign(
      {
        authMethod: decodedToken.authMethod,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: decodedToken.userId,
        tokenVersionId: tokenVersion.id,
        accessVersion: tokenVersion.accessVersion,
        organizationId: decodedToken.organizationId,
        isMfaVerified: decodedToken.isMfaVerified,
        mfaMethod: decodedToken.mfaMethod,
        mcp: {
          projectId: decodedToken?.mcp?.projectId,
          path: decodedToken?.mcp?.path
        }
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_AUTH_LIFETIME }
    );

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ms(appCfg.JWT_AUTH_LIFETIME) / 1000),
      refresh_token: dto.refresh_token,
      scope: "openid"
    };
  };

  return { oauthRegisterClient, oauthAuthorizeClient, oauthAuthorizeClientScope, oauthTokenExchange, interactWithMcp };
};
