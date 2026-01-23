/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { createAppAuth } from "@octokit/auth-app";
import { retry } from "@octokit/plugin-retry";
import { Octokit } from "@octokit/rest";

import { TIntegrationAuths } from "@app/db/schemas/integration-auths";
import { TIntegrations } from "@app/db/schemas/integrations";
import { getConfig } from "@app/lib/config/env";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { IntegrationMetadataSchema } from "../integration/integration-schema";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "../secret-import/secret-import-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { IntegrationAuthMetadataSchema, TIntegrationAuthMetadata } from "./integration-auth-schema";
import { TIntegrationAuthServiceFactory } from "./integration-auth-service";
import { Integrations } from "./integration-list";

const MAX_SYNC_SECRET_DEPTH = 5;

/**
 * Return the secrets in a given [folderId] including secrets from
 * nested imported folders recursively.
 */
const getIntegrationSecretsV2 = async (
  dto: {
    projectId: string;
    environment: string;
    folderId: string;
    depth: number;
    secretPath: string;
    decryptor: (value: Buffer | null | undefined) => string;
  },
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findByFolderId">,
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">,
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds" | "findByIds">
) => {
  const content: Record<string, boolean> = {};
  if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
    logger.info(
      `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
    );
    return content;
  }

  // process secrets in current folder
  const secrets = await secretV2BridgeDAL.findByFolderId({ folderId: dto.folderId });

  secrets.forEach((secret) => {
    const secretKey = secret.key;
    content[secretKey] = true;
  });

  // check if current folder has any imports from other folders
  const secretImports = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

  // if no imports then return secrets in the current folder
  if (!secretImports.length) return content;
  const importedSecrets = await fnSecretsV2FromImports({
    decryptor: dto.decryptor,
    folderDAL,
    secretDAL: secretV2BridgeDAL,
    secretImportDAL,
    secretImports,
    hasSecretAccess: () => true,
    viewSecretValue: true
  });

  for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
    for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
      const importedSecret = importedSecrets[i].secrets[j];
      if (!content[importedSecret.key]) {
        content[importedSecret.key] = true;
      }
    }
  }
  return content;
};

/**
 * Return the secrets in a given [folderId] including secrets from
 * nested imported folders recursively.
 */
const getIntegrationSecretsV1 = async (
  dto: {
    projectId: string;
    environment: string;
    folderId: string;
    key: string;
    depth: number;
  },
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">,
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath">,
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds">
) => {
  let content: Record<string, boolean> = {};
  if (dto.depth > MAX_SYNC_SECRET_DEPTH) {
    logger.info(
      `getIntegrationSecrets: secret depth exceeded for [projectId=${dto.projectId}] [folderId=${dto.folderId}] [depth=${dto.depth}]`
    );
    return content;
  }

  // process secrets in current folder
  const secrets = await secretDAL.findByFolderId(dto.folderId);

  secrets.forEach((secret) => {
    const secretKey = crypto.encryption().symmetric().decrypt({
      ciphertext: secret.secretKeyCiphertext,
      iv: secret.secretKeyIV,
      tag: secret.secretKeyTag,
      key: dto.key,
      keySize: SymmetricKeySize.Bits128
    });

    content[secretKey] = true;
  });

  // check if current folder has any imports from other folders
  const secretImport = await secretImportDAL.find({ folderId: dto.folderId, isReplication: false });

  // if no imports then return secrets in the current folder
  if (!secretImport) return content;

  const importedFolders = await folderDAL.findByManySecretPath(
    secretImport.map(({ importEnv, importPath }) => ({
      envId: importEnv.id,
      secretPath: importPath
    }))
  );

  for await (const folder of importedFolders) {
    if (folder) {
      // get secrets contained in each imported folder by recursively calling
      // this function against the imported folder
      const importedSecrets = await getIntegrationSecretsV1(
        {
          environment: dto.environment,
          projectId: dto.projectId,
          folderId: folder.id,
          key: dto.key,
          depth: dto.depth + 1
        },
        secretDAL,
        folderDAL,
        secretImportDAL
      );

      // add the imported secrets to the current folder secrets
      content = { ...importedSecrets, ...content };
    }
  }

  return content;
};

export const deleteGithubSecrets = async ({
  integration,
  authMetadata,
  secrets,
  accessToken
}: {
  integration: Omit<TIntegrations, "envId">;
  authMetadata: TIntegrationAuthMetadata;
  secrets: Record<string, boolean>;
  accessToken: string;
}) => {
  interface GitHubSecret {
    name: string;
    created_at: string;
    updated_at: string;
    visibility?: "all" | "private" | "selected";
    selected_repositories_url?: string | undefined;
  }

  const OctokitWithRetry = Octokit.plugin(retry);
  let octokit: Octokit;
  const appCfg = getConfig();

  if (authMetadata.installationId) {
    octokit = new OctokitWithRetry({
      authStrategy: createAppAuth,
      auth: {
        appId: appCfg.CLIENT_APP_ID_GITHUB_APP,
        privateKey: appCfg.CLIENT_PRIVATE_KEY_GITHUB_APP,
        installationId: authMetadata.installationId
      }
    });
  } else {
    octokit = new OctokitWithRetry({
      auth: accessToken
    });
  }

  enum GithubScope {
    Repo = "github-repo",
    Org = "github-org",
    Env = "github-env"
  }

  let encryptedGithubSecrets: GitHubSecret[];

  switch (integration.scope) {
    case GithubScope.Org: {
      encryptedGithubSecrets = (
        await octokit.request("GET /orgs/{org}/actions/secrets", {
          org: integration.owner as string
        })
      ).data.secrets;
      break;
    }
    case GithubScope.Env: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      encryptedGithubSecrets = (
        await octokit.request("GET /repositories/{repository_id}/environments/{environment_name}/secrets", {
          repository_id: Number(integration.appId),
          environment_name: integration.targetEnvironmentId as string
        })
      ).data.secrets;
      break;
    }
    default: {
      encryptedGithubSecrets = (
        await octokit.request("GET /repos/{owner}/{repo}/actions/secrets", {
          owner: integration.owner as string,
          repo: integration.app as string
        })
      ).data.secrets;
      break;
    }
  }

  for await (const encryptedSecret of encryptedGithubSecrets) {
    if (encryptedSecret.name in secrets) {
      switch (integration.scope) {
        case GithubScope.Org: {
          await octokit.request("DELETE /orgs/{org}/actions/secrets/{secret_name}", {
            org: integration.owner as string,
            secret_name: encryptedSecret.name
          });
          break;
        }
        case GithubScope.Env: {
          await octokit.request(
            "DELETE /repositories/{repository_id}/environments/{environment_name}/secrets/{secret_name}",
            {
              repository_id: Number(integration.appId),
              environment_name: integration.targetEnvironmentId as string,
              secret_name: encryptedSecret.name
            }
          );
          break;
        }
        default: {
          await octokit.request("DELETE /repos/{owner}/{repo}/actions/secrets/{secret_name}", {
            owner: integration.owner as string,
            repo: integration.app as string,
            secret_name: encryptedSecret.name
          });
          break;
        }
      }

      // small delay to prevent hitting API rate limits
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
};

export const deleteIntegrationSecrets = async ({
  integration,
  integrationAuth,
  integrationAuthService,
  projectBotService,
  secretV2BridgeDAL,
  folderDAL,
  secretDAL,
  secretImportDAL,
  kmsService
}: {
  integration: Omit<TIntegrations, "envId"> & {
    projectId: string;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    secretPath: string;
  };
  integrationAuth: TIntegrationAuths;
  integrationAuthService: Pick<TIntegrationAuthServiceFactory, "getIntegrationAccessToken" | "getIntegrationAuth">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findByFolderId">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByManySecretPath" | "findBySecretPath">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds" | "findByIds">;
  secretDAL: Pick<TSecretDALFactory, "findByFolderId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { shouldUseSecretV2Bridge, botKey } = await projectBotService.getBotKey(integration.projectId);
  const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId: integration.projectId
  });

  const folder = await folderDAL.findBySecretPath(
    integration.projectId,
    integration.environment.slug,
    integration.secretPath
  );

  if (!folder) {
    throw new NotFoundError({
      message: `Folder with path '${integration.secretPath}' not found in environment with slug '${integration.environment.slug}'`
    });
  }

  const { accessToken } = await integrationAuthService.getIntegrationAccessToken(
    integrationAuth,
    shouldUseSecretV2Bridge,
    botKey
  );

  const secrets = shouldUseSecretV2Bridge
    ? await getIntegrationSecretsV2(
        {
          environment: integration.environment.id,
          secretPath: integration.secretPath,
          projectId: integration.projectId,
          folderId: folder.id,
          depth: 1,
          decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "")
        },
        secretV2BridgeDAL,
        folderDAL,
        secretImportDAL
      )
    : await getIntegrationSecretsV1(
        {
          environment: integration.environment.id,
          projectId: integration.projectId,
          folderId: folder.id,
          key: botKey as string,
          depth: 1
        },
        secretDAL,
        folderDAL,
        secretImportDAL
      );

  const suffixedSecrets: typeof secrets = {};
  const metadata = IntegrationMetadataSchema.parse(integration.metadata);

  if (metadata) {
    Object.keys(secrets).forEach((key) => {
      const prefix = metadata?.secretPrefix || "";
      const suffix = metadata?.secretSuffix || "";
      const newKey = prefix + key + suffix;
      suffixedSecrets[newKey] = secrets[key];
    });
  }

  switch (integration.integration) {
    case Integrations.GITHUB: {
      await deleteGithubSecrets({
        integration,
        authMetadata: IntegrationAuthMetadataSchema.parse(integrationAuth.metadata || {}),
        accessToken,
        secrets: Object.keys(suffixedSecrets).length !== 0 ? suffixedSecrets : secrets
      });
      break;
    }
    default:
      throw new BadRequestError({
        message: "Invalid integration"
      });
  }
};
