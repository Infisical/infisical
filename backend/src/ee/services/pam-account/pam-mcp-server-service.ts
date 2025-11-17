import crypto from "node:crypto";

import { ForbiddenError, subject } from "@casl/ability";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { decryptResourceConnectionDetails } from "@app/ee/services/pam-resource/pam-resource-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ProjectServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import {
  TMcpAccountCredentials,
  TMcpResourceConnectionDetails,
  TOAuthAuthorizationServerMetadata,
  TOAuthDynamicClientMetadata,
  TOAuthTokenResponse
} from "../pam-resource/mcp/mcp-resource-types";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { decryptAccountCredentials, encryptAccountCredentials } from "./pam-account-fns";

type TPamMcpServerServiceFactoryDep = {
  pamAccountDAL: TPamAccountDALFactory;
  pamResourceDAL: TPamResourceDALFactory;
  pamFolderDAL: TPamFolderDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TPamMcpServerServiceFactory = ReturnType<typeof pamMcpServerServiceFactory>;

export const PamMcpServerConfigurationSchema = z.object({
  version: z.number().default(1),
  statement: z.object({
    toolsAllowed: z.string().array().optional()
  })
});

export type TPamMcpServerConfiguration = z.infer<typeof PamMcpServerConfigurationSchema>;

export const pamMcpServerServiceFactory = ({
  pamAccountDAL,
  pamResourceDAL,
  pamFolderDAL,
  permissionService,
  licenseService,
  kmsService,
  keyStore
}: TPamMcpServerServiceFactoryDep) => {
  const handleMcpServerOauthAuthorize = async (actor: ProjectServiceActor, accountId: string) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findOne({
      id: account.resourceId,
      resourceType: PamResource.Mcp
    });
    if (!resource) throw new NotFoundError({ message: `MCP Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const connectionDetails = (await decryptResourceConnectionDetails({
      projectId: resource.projectId,
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      kmsService
    })) as TMcpResourceConnectionDetails;

    const appCfg = getConfig();
    const issuer = new URL(connectionDetails.url).origin;

    // get details of the auth server
    const { data: serverMetadata } = await request.get<TOAuthAuthorizationServerMetadata>(
      `${issuer}/.well-known/oauth-authorization-server`
    );

    const redirectUri = `${appCfg.SITE_URL}/projects/pam/${resource.projectId}/mcp-server-oauth/${accountId}/callback`;

    // register the client
    const { data: clientMetadata } = await request.post<TOAuthDynamicClientMetadata>(
      serverMetadata.registration_endpoint,
      {
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        client_name: `Infisical PAM MCP Client - ${account.name}`
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = Buffer.from(crypto.createHash("sha256").update(codeVerifier).digest()).toString("base64url");

    const authUrl = new URL(serverMetadata.authorization_endpoint);
    authUrl.searchParams.set("client_id", clientMetadata.client_id);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "read write");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.PamMcpServerOauth(accountId),
      5 * 60,
      JSON.stringify({
        codeChallenge,
        codeVerifier,
        clientId: clientMetadata.client_id
      })
    );
    return authUrl;
  };

  const handleMcpServerOauthCallback = async (actor: ProjectServiceActor, accountId: string, code: string) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findOne({
      id: account.resourceId,
      resourceType: PamResource.Mcp
    });
    if (!resource) throw new NotFoundError({ message: `MCP Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const connectionDetails = (await decryptResourceConnectionDetails({
      projectId: resource.projectId,
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      kmsService
    })) as TMcpResourceConnectionDetails;

    const oauthInfoSession = await keyStore.getItem(KeyStorePrefixes.PamMcpServerOauth(accountId));
    if (!oauthInfoSession) throw new BadRequestError({ message: "OAuth session not found. Please reconnect with MCP" });

    const oauthInfo = await z
      .object({
        codeChallenge: z.string(),
        codeVerifier: z.string(),
        clientId: z.string()
      })
      .parseAsync(JSON.parse(oauthInfoSession));

    const appCfg = getConfig();
    const issuer = new URL(connectionDetails.url).origin;
    // get details of the auth server
    const { data: serverMetadata } = await request.get<TOAuthAuthorizationServerMetadata>(
      `${issuer}/.well-known/oauth-authorization-server`
    );

    const { data } = await request.post<TOAuthTokenResponse>(
      serverMetadata.token_endpoint,
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appCfg.SITE_URL}/projects/pam/${resource.projectId}/mcp-server-oauth/${accountId}/callback`,
        client_id: oauthInfo.clientId,
        code_verifier: oauthInfo.codeVerifier
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const decryptedCredentials = (await decryptAccountCredentials({
      encryptedCredentials: account.encryptedCredentials,
      projectId: account.projectId,
      kmsService
    })) as TMcpAccountCredentials;

    const encryptedCredentials = await encryptAccountCredentials({
      credentials: {
        ...decryptedCredentials,
        token: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in
        }
      },
      projectId: resource.projectId,
      kmsService
    });

    await pamAccountDAL.updateById(accountId, { encryptedCredentials });

    return { projectId: account.projectId };
  };

  const listMcpTools = async (actor: ProjectServiceActor, accountId: string) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findOne({
      id: account.resourceId,
      resourceType: PamResource.Mcp
    });
    if (!resource) throw new NotFoundError({ message: `MCP Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const connectionDetails = (await decryptResourceConnectionDetails({
      projectId: resource.projectId,
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      kmsService
    })) as TMcpResourceConnectionDetails;

    const decryptedCredentials = (await decryptAccountCredentials({
      encryptedCredentials: account.encryptedCredentials,
      projectId: account.projectId,
      kmsService
    })) as TMcpAccountCredentials;

    let client: Client | undefined;
    try {
      client = new Client({
        name: `infisical-pam-client-${account.name}`,
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
      return tools.map((el) => ({ name: el.name, description: el.description }));
    } finally {
      if (client) await client.close();
    }
  };

  const listMcpAccountConfiguredRules = async (actor: ProjectServiceActor, accountId: string) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findOne({
      id: account.resourceId,
      resourceType: PamResource.Mcp
    });
    if (!resource) throw new NotFoundError({ message: `MCP Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const rules = await PamMcpServerConfigurationSchema.parseAsync(account.config || { version: 1, statement: {} });
    return rules;
  };

  const updateMcpAccountConfiguredRules = async (
    actor: ProjectServiceActor,
    accountId: string,
    rules: TPamMcpServerConfiguration
  ) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findOne({
      id: account.resourceId,
      resourceType: PamResource.Mcp
    });
    if (!resource) throw new NotFoundError({ message: `MCP Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    await pamAccountDAL.updateById(accountId, { config: rules });
    return rules;
  };

  return {
    handleMcpServerOauthAuthorize,
    handleMcpServerOauthCallback,
    listMcpAccountConfiguredRules,
    updateMcpAccountConfiguredRules,
    listMcpTools
  };
};
