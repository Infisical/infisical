import slugify from "@sindresorhus/slugify";
import { randomUUID } from "crypto";
import sjcl from "sjcl";
import tweetnacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";

import { SecretType, TSecretFolders } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { CommitType, TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { fnSecretBulkInsert, getAllSecretReferences } from "../secret-v2-bridge/secret-v2-bridge-fns";
import type { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { InfisicalImportData, TEnvKeyExportJSON, TImportInfisicalDataCreate } from "./external-migration-types";

export type TImportDataIntoInfisicalDTO = {
  projectDAL: Pick<TProjectDALFactory, "transaction">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findLastEnvPosition" | "create" | "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

  secretDAL: Pick<TSecretV2BridgeDALFactory, "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "find">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "create">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "create" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany" | "create">;

  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany">;

  folderDAL: Pick<TSecretFolderDALFactory, "create" | "findBySecretPath" | "findById">;
  projectService: Pick<TProjectServiceFactory, "createProject">;
  projectEnvService: Pick<TProjectEnvServiceFactory, "createEnvironment">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "create">;

  input: TImportInfisicalDataCreate;
};

const { codec, hash } = sjcl;
const { secretbox } = tweetnacl;

export const decryptEnvKeyDataFn = async (decryptionKey: string, encryptedJson: { nonce: string; data: string }) => {
  const key = tweetnaclUtil.decodeBase64(codec.base64.fromBits(hash.sha256.hash(decryptionKey)));
  const nonce = tweetnaclUtil.decodeBase64(encryptedJson.nonce);
  const encryptedData = tweetnaclUtil.decodeBase64(encryptedJson.data);

  const decrypted = secretbox.open(encryptedData, nonce, key);

  if (!decrypted) {
    throw new BadRequestError({ message: "Decryption failed, please check the entered encryption key" });
  }

  const decryptedJson = tweetnaclUtil.encodeUTF8(decrypted);
  return decryptedJson;
};

export const parseEnvKeyDataFn = async (decryptedJson: string): Promise<InfisicalImportData> => {
  const parsedJson: TEnvKeyExportJSON = JSON.parse(decryptedJson) as TEnvKeyExportJSON;

  const infisicalImportData: InfisicalImportData = {
    projects: [],
    environments: [],
    folders: [],
    secrets: []
  };

  parsedJson.apps.forEach((app: { name: string; id: string }) => {
    infisicalImportData.projects.push({ name: app.name, id: app.id });
  });

  // string to string map for env templates
  const envTemplates = new Map<string, string>();
  for (const env of parsedJson.defaultEnvironmentRoles) {
    envTemplates.set(env.id, env.defaultName);
  }

  // custom base environments
  for (const env of parsedJson.nonDefaultEnvironmentRoles) {
    envTemplates.set(env.id, env.name);
  }

  // environments
  for (const env of parsedJson.baseEnvironments) {
    const appId = parsedJson.apps.find((a) => a.id === env.envParentId)?.id;

    // If we find the app from the envParentId, we know this is a root-level environment.
    if (appId) {
      infisicalImportData.environments.push({
        id: env.id,
        name: envTemplates.get(env.environmentRoleId)!,
        projectId: appId
      });
    }
  }

  const findRootInheritedSecret = (
    secret: { val?: string; inheritsEnvironmentId?: string },
    secretName: string,
    envs: typeof parsedJson.envs
  ): { val?: string } => {
    if (!secret) {
      return {
        val: ""
      };
    }

    // If we have a direct value, return it
    if (secret.val !== undefined) {
      return secret;
    }

    // If there's no inheritance, return the secret as is
    if (!secret.inheritsEnvironmentId) {
      return secret;
    }

    const inheritedEnv = envs[secret.inheritsEnvironmentId];
    if (!inheritedEnv) return secret;
    return findRootInheritedSecret(inheritedEnv.variables[secretName], secretName, envs);
  };

  const targetIdToFolderIdsMap = new Map<string, string>();

  const processBranches = () => {
    for (const subEnv of parsedJson.subEnvironments) {
      const app = parsedJson.apps.find((a) => a.id === subEnv.envParentId);
      const block = parsedJson.blocks.find((b) => b.id === subEnv.envParentId);

      if (app) {
        // Handle regular app branches
        const branchEnvironment = infisicalImportData.environments.find((e) => e.id === subEnv.parentEnvironmentId);

        // check if the folder already exists in the same parent environment with the same name

        const folderExists = infisicalImportData.folders.some(
          (f) => f.name === subEnv.subName && f.parentFolderId === subEnv.parentEnvironmentId
        );

        // No need to map to target ID's here, because we are not dealing with blocks
        if (!folderExists) {
          infisicalImportData.folders.push({
            name: subEnv.subName,
            parentFolderId: subEnv.parentEnvironmentId,
            environmentId: branchEnvironment!.id,
            id: subEnv.id
          });
        }
      }

      if (block) {
        // Handle block branches
        // 1. Find all apps that use this block
        const appsUsingBlock = parsedJson.appBlocks.filter((ab) => ab.blockId === block.id);

        for (const { appId, orderIndex } of appsUsingBlock) {
          // 2. Find the matching environment in the app based on the environment role
          const blockBaseEnv = parsedJson.baseEnvironments.find((be) => be.id === subEnv.parentEnvironmentId);

          // eslint-disable-next-line no-continue
          if (!blockBaseEnv) continue;

          const matchingAppEnv = parsedJson.baseEnvironments.find(
            (be) => be.envParentId === appId && be.environmentRoleId === blockBaseEnv.environmentRoleId
          );

          // eslint-disable-next-line no-continue
          if (!matchingAppEnv) continue;

          const folderExists = infisicalImportData.folders.some(
            (f) => f.name === subEnv.subName && f.parentFolderId === matchingAppEnv.id
          );

          if (!folderExists) {
            // 3. Create a folder in the matching app environment
            infisicalImportData.folders.push({
              name: subEnv.subName,
              parentFolderId: matchingAppEnv.id,
              environmentId: matchingAppEnv.id,
              id: `${subEnv.id}-${appId}` // Create unique ID for each app's copy of the branch
            });
          } else {
            // folder already exists, so lets map the old folder id to the new folder id
            targetIdToFolderIdsMap.set(subEnv.id, `${subEnv.id}-${appId}`);
          }

          // 4. Process secrets in the block branch for this app
          const branchSecrets = parsedJson.envs[subEnv.id]?.variables || {};
          for (const [secretName, secretData] of Object.entries(branchSecrets)) {
            if (secretData.inheritsEnvironmentId) {
              const resolvedSecret = findRootInheritedSecret(secretData, secretName, parsedJson.envs);

              // If the secret already exists in the environment, we need to check the orderIndex of the appBlock. The appBlock with the highest orderIndex should take precedence.
              const preExistingSecretIndex = infisicalImportData.secrets.findIndex(
                (s) => s.name === secretName && s.environmentId === matchingAppEnv.id
              );

              if (preExistingSecretIndex !== -1) {
                const preExistingSecret = infisicalImportData.secrets[preExistingSecretIndex];

                if (
                  preExistingSecret.appBlockOrderIndex !== undefined &&
                  orderIndex > preExistingSecret.appBlockOrderIndex
                ) {
                  // if the existing secret has a lower orderIndex, we should replace it
                  infisicalImportData.secrets[preExistingSecretIndex] = {
                    ...preExistingSecret,
                    value: resolvedSecret.val || "",
                    appBlockOrderIndex: orderIndex
                  };
                }

                // eslint-disable-next-line no-continue
                continue;
              }

              infisicalImportData.secrets.push({
                id: randomUUID(),
                name: secretName,
                environmentId: matchingAppEnv.id,
                value: resolvedSecret.val || "",
                folderId: `${subEnv.id}-${appId}`,
                appBlockOrderIndex: orderIndex
              });
            } else {
              // If the secret already exists in the environment, we need to check the orderIndex of the appBlock. The appBlock with the highest orderIndex should take precedence.
              const preExistingSecretIndex = infisicalImportData.secrets.findIndex(
                (s) => s.name === secretName && s.environmentId === matchingAppEnv.id
              );

              if (preExistingSecretIndex !== -1) {
                const preExistingSecret = infisicalImportData.secrets[preExistingSecretIndex];

                if (
                  preExistingSecret.appBlockOrderIndex !== undefined &&
                  orderIndex > preExistingSecret.appBlockOrderIndex
                ) {
                  // if the existing secret has a lower orderIndex, we should replace it
                  infisicalImportData.secrets[preExistingSecretIndex] = {
                    ...preExistingSecret,
                    value: secretData.val || "",
                    appBlockOrderIndex: orderIndex
                  };
                }

                // eslint-disable-next-line no-continue
                continue;
              }

              infisicalImportData.secrets.push({
                id: randomUUID(),
                name: secretName,
                environmentId: matchingAppEnv.id,
                value: secretData.val || "",
                folderId: `${subEnv.id}-${appId}`,
                appBlockOrderIndex: orderIndex
              });
            }
          }
        }
      }
    }
  };

  const processBlocksForApp = (appIds: string[]) => {
    for (const appId of appIds) {
      const blocksInApp = parsedJson.appBlocks.filter((ab) => ab.appId === appId);
      logger.info(
        {
          blocksInApp
        },
        "[processBlocksForApp]: Processing blocks for app"
      );

      for (const appBlock of blocksInApp) {
        // 1. find all base environments for this block
        const blockBaseEnvironments = parsedJson.baseEnvironments.filter((env) => env.envParentId === appBlock.blockId);
        logger.info(
          {
            blockBaseEnvironments
          },
          "[processBlocksForApp]: Processing block base environments"
        );

        for (const blockBaseEnvironment of blockBaseEnvironments) {
          // 2. find the corresponding environment that is not from the block
          const matchingEnv = parsedJson.baseEnvironments.find(
            (be) =>
              be.environmentRoleId === blockBaseEnvironment.environmentRoleId && be.envParentId !== appBlock.blockId
          );

          if (!matchingEnv) {
            throw new Error(`Could not find environment for block ${appBlock.blockId}`);
          }

          // 3. find all the secrets for this environment block
          const blockSecrets = parsedJson.envs[blockBaseEnvironment.id].variables;

          logger.info(
            {
              blockSecretsLength: Object.keys(blockSecrets).length
            },
            "[processBlocksForApp]: Processing block secrets"
          );

          // 4. process each secret
          for (const secret of Object.keys(blockSecrets)) {
            const selectedSecret = blockSecrets[secret];

            if (selectedSecret.inheritsEnvironmentId) {
              const resolvedSecret = findRootInheritedSecret(selectedSecret, secret, parsedJson.envs);

              // If the secret already exists in the environment, we need to check the orderIndex of the appBlock. The appBlock with the highest orderIndex should take precedence.
              const preExistingSecretIndex = infisicalImportData.secrets.findIndex(
                (s) => s.name === secret && s.environmentId === matchingEnv.id
              );

              if (preExistingSecretIndex !== -1) {
                const preExistingSecret = infisicalImportData.secrets[preExistingSecretIndex];

                if (
                  preExistingSecret.appBlockOrderIndex !== undefined &&
                  appBlock.orderIndex > preExistingSecret.appBlockOrderIndex
                ) {
                  // if the existing secret has a lower orderIndex, we should replace it
                  infisicalImportData.secrets[preExistingSecretIndex] = {
                    ...preExistingSecret,
                    value: selectedSecret.val || "",
                    appBlockOrderIndex: appBlock.orderIndex
                  };
                }

                // eslint-disable-next-line no-continue
                continue;
              }

              infisicalImportData.secrets.push({
                id: randomUUID(),
                name: secret,
                environmentId: matchingEnv.id,
                value: resolvedSecret.val || "",
                appBlockOrderIndex: appBlock.orderIndex
              });
            } else {
              // If the secret already exists in the environment, we need to check the orderIndex of the appBlock. The appBlock with the highest orderIndex should take precedence.
              const preExistingSecretIndex = infisicalImportData.secrets.findIndex(
                (s) => s.name === secret && s.environmentId === matchingEnv.id
              );

              if (preExistingSecretIndex !== -1) {
                const preExistingSecret = infisicalImportData.secrets[preExistingSecretIndex];

                if (
                  preExistingSecret.appBlockOrderIndex !== undefined &&
                  appBlock.orderIndex > preExistingSecret.appBlockOrderIndex
                ) {
                  // if the existing secret has a lower orderIndex, we should replace it
                  infisicalImportData.secrets[preExistingSecretIndex] = {
                    ...preExistingSecret,
                    value: selectedSecret.val || "",
                    appBlockOrderIndex: appBlock.orderIndex
                  };
                }

                // eslint-disable-next-line no-continue
                continue;
              }

              infisicalImportData.secrets.push({
                id: randomUUID(),
                name: secret,
                environmentId: matchingEnv.id,
                value: selectedSecret.val || "",
                appBlockOrderIndex: appBlock.orderIndex
              });
            }
          }
        }
      }
    }
  };

  processBranches();
  processBlocksForApp(infisicalImportData.projects.map((app) => app.id));

  for (const env of Object.keys(parsedJson.envs)) {
    // Skip user-specific environments
    // eslint-disable-next-line no-continue
    if (env.includes("|")) continue;

    const envData = parsedJson.envs[env];
    const baseEnv = parsedJson.baseEnvironments.find((be) => be.id === env);
    const subEnv = parsedJson.subEnvironments.find((se) => se.id === env);

    // Skip if we can't find either a base environment or sub-environment
    if (!baseEnv && !subEnv) {
      logger.info(
        {
          envId: env
        },
        "[parseEnvKeyDataFn]: Could not find base or sub environment for env, skipping"
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    // If this is a base environment of a block, skip it (handled by processBlocksForApp)
    if (baseEnv) {
      const isBlock = parsedJson.appBlocks.some((block) => block.blockId === baseEnv.envParentId);
      if (isBlock) {
        logger.info(
          {
            envId: env,
            baseEnv
          },
          "[parseEnvKeyDataFn]: Skipping block environment (handled separately)"
        );
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    // Process each secret in this environment or branch
    for (const [secretName, secretData] of Object.entries(envData.variables)) {
      const indexOfExistingSecret = infisicalImportData.secrets.findIndex(
        (s) =>
          s.name === secretName &&
          (s.environmentId === subEnv?.parentEnvironmentId || s.environmentId === env) &&
          (s.folderId ? s.folderId === subEnv?.id : true) &&
          (secretData.val ? s.value === secretData.val : true)
      );

      if (secretData.inheritsEnvironmentId) {
        const resolvedSecret = findRootInheritedSecret(secretData, secretName, parsedJson.envs);
        // Check if there's already a secret with this name in the environment, if there is, we should override it. Because if there's already one, we know its coming from a block.
        // Variables from the normal environment should take precedence over variables from the block.
        if (indexOfExistingSecret !== -1) {
          // if a existing secret is found, we should replace it directly
          const newSecret: (typeof infisicalImportData.secrets)[number] = {
            ...infisicalImportData.secrets[indexOfExistingSecret],
            value: resolvedSecret.val || ""
          };

          infisicalImportData.secrets[indexOfExistingSecret] = newSecret;

          // eslint-disable-next-line no-continue
          continue;
        }

        infisicalImportData.secrets.push({
          id: randomUUID(),
          name: secretName,
          environmentId: subEnv ? subEnv.parentEnvironmentId : env,
          value: resolvedSecret.val || "",
          ...(subEnv && { folderId: subEnv.id }) // Add folderId if this is a branch secret
        });
      } else {
        // Check if there's already a secret with this name in the environment, if there is, we should override it. Because if there's already one, we know its coming from a block.
        // Variables from the normal environment should take precedence over variables from the block.

        if (indexOfExistingSecret !== -1) {
          // if a existing secret is found, we should replace it directly
          const newSecret: (typeof infisicalImportData.secrets)[number] = {
            ...infisicalImportData.secrets[indexOfExistingSecret],
            value: secretData.val || ""
          };

          infisicalImportData.secrets[indexOfExistingSecret] = newSecret;

          // eslint-disable-next-line no-continue
          continue;
        }

        const folderId = targetIdToFolderIdsMap.get(subEnv?.id || "") || subEnv?.id;

        infisicalImportData.secrets.push({
          id: randomUUID(),
          name: secretName,
          environmentId: subEnv ? subEnv.parentEnvironmentId : env,
          value: secretData.val || "",
          ...(folderId && { folderId })
        });
      }
    }
  }

  return infisicalImportData;
};

export const importDataIntoInfisicalFn = async ({
  projectService,
  projectEnvDAL,
  projectDAL,
  secretDAL,
  kmsService,
  secretVersionDAL,
  secretTagDAL,
  secretVersionTagDAL,
  folderDAL,
  resourceMetadataDAL,
  folderVersionDAL,
  folderCommitService,
  input: { data, actor, actorId, actorOrgId, actorAuthMethod }
}: TImportDataIntoInfisicalDTO) => {
  // Import data to infisical
  if (!data || !data.projects) {
    throw new BadRequestError({ message: "No projects found in data" });
  }

  const originalToNewProjectId = new Map<string, string>();
  const originalToNewEnvironmentId = new Map<
    string,
    { envId: string; envSlug: string; rootFolderId: string; projectId: string }
  >();
  const originalToNewFolderId = new Map<
    string,
    {
      folderId: string;
      projectId: string;
    }
  >();
  const projectsNotImported: string[] = [];

  await projectDAL.transaction(async (tx) => {
    for await (const project of data.projects) {
      const newProject = await projectService
        .createProject({
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          workspaceName: project.name,
          createDefaultEnvs: false,
          tx
        })
        .catch((e) => {
          logger.error(e, `Failed to import to project [name:${project.name}]`);
          throw new BadRequestError({ message: `Failed to import to project [name:${project.name}]` });
        });
      originalToNewProjectId.set(project.id, newProject.id);
    }

    // Import environments
    if (data.environments) {
      for await (const environment of data.environments) {
        const projectId = originalToNewProjectId.get(environment.projectId);
        const slug = slugify(`${environment.name}-${alphaNumericNanoId(4)}`);

        if (!projectId) {
          projectsNotImported.push(environment.projectId);
          // eslint-disable-next-line no-continue
          continue;
        }

        const existingEnv = await projectEnvDAL.findOne({ projectId, slug }, tx);

        if (existingEnv) {
          throw new BadRequestError({
            message: `Environment with slug '${slug}' already exist`,
            name: "CreateEnvironment"
          });
        }

        const lastPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
        const doc = await projectEnvDAL.create({ slug, name: environment.name, projectId, position: lastPos + 1 }, tx);
        const folder = await folderDAL.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);

        originalToNewEnvironmentId.set(environment.id, {
          envSlug: doc.slug,
          envId: doc.id,
          rootFolderId: folder.id,
          projectId
        });
      }
    }

    if (data.folders) {
      for await (const folder of data.folders) {
        const parentEnv = originalToNewEnvironmentId.get(folder.parentFolderId as string);

        if (!parentEnv) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const newFolder = await folderDAL.create(
          {
            name: folder.name,
            envId: parentEnv.envId,
            parentId: parentEnv.rootFolderId
          },
          tx
        );

        const newFolderVersion = await folderVersionDAL.create(
          {
            name: newFolder.name,
            envId: newFolder.envId,
            version: newFolder.version,
            folderId: newFolder.id
          },
          tx
        );

        await folderCommitService.createCommit(
          {
            actor: {
              type: actor,
              metadata: {
                id: actorId
              }
            },
            message: "Changed by external migration",
            folderId: parentEnv.rootFolderId,
            changes: [
              {
                type: CommitType.ADD,
                folderVersionId: newFolderVersion.id
              }
            ]
          },
          tx
        );

        originalToNewFolderId.set(folder.id, {
          folderId: newFolder.id,
          projectId: parentEnv.projectId
        });
      }
    }

    // Useful for debugging:
    // console.log("data.secrets", data.secrets);
    // console.log("data.folders", data.folders);
    // console.log("data.environment", data.environments);

    if (data.secrets && data.secrets.length > 0) {
      const mappedToEnvironmentId = new Map<
        string,
        {
          secretKey: string;
          secretValue: string;
          folderId?: string;
          isFromBlock?: boolean;
        }[]
      >();

      for (const secret of data.secrets) {
        const targetId = secret.folderId || secret.environmentId;

        // Skip if we can't find either an environment or folder mapping for this secret
        if (!originalToNewEnvironmentId.get(secret.environmentId) && !originalToNewFolderId.get(targetId)) {
          logger.info({ secret }, "[importDataIntoInfisicalFn]: Could not find environment or folder for secret");

          // eslint-disable-next-line no-continue
          continue;
        }

        if (!mappedToEnvironmentId.has(targetId)) {
          mappedToEnvironmentId.set(targetId, []);
        }

        const alreadyHasSecret = mappedToEnvironmentId
          .get(targetId)!
          .find((el) => el.secretKey === secret.name && el.folderId === secret.folderId);

        if (alreadyHasSecret && alreadyHasSecret.isFromBlock) {
          // remove the existing secret if any
          mappedToEnvironmentId
            .get(targetId)!
            .splice(mappedToEnvironmentId.get(targetId)!.indexOf(alreadyHasSecret), 1);
        }
        mappedToEnvironmentId.get(targetId)!.push({
          secretKey: secret.name,
          secretValue: secret.value || "",
          folderId: secret.folderId,
          isFromBlock: secret.appBlockOrderIndex !== undefined
        });
      }

      // for each of the mappedEnvironmentId
      for await (const [targetId, secrets] of mappedToEnvironmentId) {
        logger.info("[importDataIntoInfisicalFn]: Processing secrets for targetId", targetId);

        let selectedFolder: TSecretFolders | undefined;
        let selectedProjectId: string | undefined;

        // Case 1: Secret belongs to a folder / branch / branch of a block
        const foundFolder = originalToNewFolderId.get(targetId);
        if (foundFolder) {
          logger.info("[importDataIntoInfisicalFn]: Processing secrets for folder");
          selectedFolder = await folderDAL.findById(foundFolder.folderId, tx);
          selectedProjectId = foundFolder.projectId;
        } else {
          logger.info("[importDataIntoInfisicalFn]: Processing secrets for normal environment");
          const environment = data.environments.find((env) => env.id === targetId);
          if (!environment) {
            logger.info(
              {
                targetId
              },
              "[importDataIntoInfisicalFn]: Could not find environment for secret"
            );
            // eslint-disable-next-line no-continue
            continue;
          }

          const projectId = originalToNewProjectId.get(environment.projectId)!;

          if (!projectId) {
            throw new BadRequestError({ message: `Failed to import secret, project not found` });
          }

          const env = originalToNewEnvironmentId.get(targetId);
          if (!env) {
            logger.info(
              {
                targetId
              },
              "[importDataIntoInfisicalFn]: Could not find environment for secret"
            );

            // eslint-disable-next-line no-continue
            continue;
          }

          const folder = await folderDAL.findBySecretPath(projectId, env.envSlug, "/", tx);

          if (!folder) {
            throw new NotFoundError({
              message: `Folder not found for the given environment slug (${env.envSlug}) & secret path (/)`,
              name: "Create secret"
            });
          }

          selectedFolder = folder;
          selectedProjectId = projectId;
        }

        if (!selectedFolder) {
          throw new NotFoundError({
            message: `Folder not found for the given environment slug & secret path`,
            name: "CreateSecret"
          });
        }

        if (!selectedProjectId) {
          throw new NotFoundError({
            message: `Project not found for the given environment slug & secret path`,
            name: "CreateSecret"
          });
        }

        const { encryptor: secretManagerEncrypt } = await kmsService.createCipherPairWithDataKey(
          {
            type: KmsDataKey.SecretManager,
            projectId: selectedProjectId
          },
          tx
        );

        const secretBatches = chunkArray(secrets, 2500);
        for await (const secretBatch of secretBatches) {
          const secretsByKeys = await secretDAL.findBySecretKeys(
            selectedFolder.id,
            secretBatch.map((el) => ({
              key: el.secretKey,
              type: SecretType.Shared
            })),
            tx
          );
          if (secretsByKeys.length) {
            throw new BadRequestError({
              message: `Secret already exist: ${secretsByKeys.map((el) => el.key).join(",")}`
            });
          }
          await fnSecretBulkInsert({
            inputSecrets: secretBatch.map((el) => {
              const references = getAllSecretReferences(el.secretValue).nestedReferences;

              return {
                version: 1,
                encryptedValue: el.secretValue
                  ? secretManagerEncrypt({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob
                  : undefined,
                key: el.secretKey,
                references,
                type: SecretType.Shared
              };
            }),
            folderId: selectedFolder.id,
            orgId: actorOrgId,
            resourceMetadataDAL,
            secretDAL,
            secretVersionDAL,
            secretTagDAL,
            secretVersionTagDAL,
            folderCommitService,
            actor: {
              type: actor,
              actorId
            },
            tx
          });
        }
      }
    }
  });

  return { projectsNotImported };
};
