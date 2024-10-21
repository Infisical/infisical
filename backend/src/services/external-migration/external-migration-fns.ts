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

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectServiceFactory } from "../project/project-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TProjectEnvServiceFactory } from "../project-env/project-env-service";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { fnSecretBulkInsert, getAllNestedSecretReferences } from "../secret-v2-bridge/secret-v2-bridge-fns";
import type { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { InfisicalImportData, TEnvKeyExportJSON, TImportInfisicalDataCreate } from "./external-migration-types";

export type TImportDataIntoInfisicalDTO = {
  projectDAL: Pick<TProjectDALFactory, "transaction">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findLastEnvPosition" | "create" | "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;

  secretDAL: Pick<TSecretV2BridgeDALFactory, "insertMany" | "upsertSecretReferences" | "findBySecretKeys">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "create">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "create">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany" | "create">;

  folderDAL: Pick<TSecretFolderDALFactory, "create" | "findBySecretPath" | "findById">;
  projectService: Pick<TProjectServiceFactory, "createProject">;
  projectEnvService: Pick<TProjectEnvServiceFactory, "createEnvironment">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "createManySecret">;

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
    const app = parsedJson.apps.find((a) => a.id === env.envParentId);

    // If we find the app from the envParentId, we know this is a root-level environment.
    if (app) {
      infisicalImportData.environments.push({
        id: env.id,
        name: envTemplates.get(env.environmentRoleId)!,
        projectId: app.id
      });
    } else {
      // const parentBlock = parsedJson.blocks.find((b) => b.id === env.envParentId);
      // // If this is found, then we know this is a sub-environment. The `parentEnvironment` is the sub environment.
      // const subEnvironment = parsedJson.subEnvironments.find(
      //   (s) => s.parentEnvironmentId === env.id && parsedJson.apps.find((a) => a.id === s.envParentId)
      // );
      // if (subEnvironment) {
      //   infisicalImportData.folders.push({
      //     name: subEnvironment.subName,
      //     parentFolderId: subEnvironment.parentEnvironmentId,
      //     environmentId: env.id,
      //     id: subEnvironment.id
      //   });
      // } else if (parentBlock) {
      //   // TODO(daniel): Find a way to get the secrets from the parent block, so we can later insert it
      // }
    }
  }

  for (const subEnv of parsedJson.subEnvironments) {
    // this will only find the app if the subEnv is a branch, not a block.
    const app = parsedJson.apps.find((a) => a.id === subEnv.envParentId);

    const parentEnvironment = infisicalImportData.environments.find((e) => e.id === subEnv.parentEnvironmentId);

    if (app) {
      infisicalImportData.folders.push({
        name: subEnv.subName,
        parentFolderId: subEnv.parentEnvironmentId,
        environmentId: parentEnvironment!.id,
        id: subEnv.id
      });
    }
  }

  // secrets with/without inheritance
  for (const env of Object.keys(parsedJson.envs)) {
    if (!env.includes("|")) {
      const envData = parsedJson.envs[env];
      for (const secret of Object.keys(envData.variables)) {
        const selectedSecret = envData.variables[secret];

        if (selectedSecret.inheritsEnvironmentId) {
          const findRootInheritedSecret = (currentSecret: { val?: string; inheritsEnvironmentId?: string }) => {
            if (currentSecret.inheritsEnvironmentId) {
              const inheritedSecret = parsedJson.envs[currentSecret.inheritsEnvironmentId].variables[secret];
              if (inheritedSecret) {
                // eslint-disable-next-line no-param-reassign
                currentSecret.val = inheritedSecret.val;
              }

              findRootInheritedSecret(inheritedSecret);
            }
            return currentSecret;
          };

          const sec = findRootInheritedSecret(selectedSecret);

          infisicalImportData.secrets.push({
            id: randomUUID(),
            name: secret,
            environmentId: env,
            value: sec.val || "???"
          });

          // eslint-disable-next-line no-continue
          continue;
        }

        infisicalImportData.secrets.push({
          id: randomUUID(),
          name: secret,
          environmentId: env,
          value: selectedSecret.val || "???_???"
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

        originalToNewFolderId.set(folder.id, {
          folderId: newFolder.id,
          projectId: parentEnv.projectId
        });
      }
    }

    console.log("data.folders", data.folders);

    console.log("data.secrets", data.secrets);

    if (data.secrets && data.secrets.length > 0) {
      const mappedToEnvironmentId = new Map<
        string,
        {
          secretKey: string;
          secretValue: string;
        }[]
      >();

      for (const secret of data.secrets) {
        if (!originalToNewEnvironmentId.get(secret.environmentId) && !originalToNewFolderId.get(secret.environmentId)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (!mappedToEnvironmentId.has(secret.environmentId)) {
          mappedToEnvironmentId.set(secret.environmentId, []);
        }
        mappedToEnvironmentId.get(secret.environmentId)!.push({
          secretKey: secret.name,
          secretValue: secret.value || ""
        });
      }

      // for each of the mappedEnvironmentId
      for await (const [envId, secrets] of mappedToEnvironmentId) {
        console.log(`envId ${envId} secrets:`, secrets);

        const environment = data.environments.find((env) => env.id === envId);
        const foundFolder = originalToNewFolderId.get(envId);

        console.log(`FOUND FOLDER BY ENV.ID ${envId}`, foundFolder);

        let selectedFolder: TSecretFolders | undefined;
        let selectedProjectId: string | undefined;
        if (foundFolder) {
          console.log("RUNNING FOLDER HANDLER");

          selectedFolder = await folderDAL.findById(foundFolder.folderId, tx);
          selectedProjectId = foundFolder.projectId;
        } else if (environment) {
          console.log("RUNNING ENVIRONMENT HANDLER");
          const projectId = originalToNewProjectId.get(environment.projectId)!;

          if (!projectId) {
            throw new BadRequestError({ message: `Failed to import secret, project not found` });
          }

          const env = originalToNewEnvironmentId.get(envId)!;
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
              const references = getAllNestedSecretReferences(el.secretValue);

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
            secretDAL,
            secretVersionDAL,
            secretTagDAL,
            secretVersionTagDAL,
            tx
          });
        }
      }
    }
  });

  return { projectsNotImported };
};
