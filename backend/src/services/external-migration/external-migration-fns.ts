import slugify from "@sindresorhus/slugify";
import { randomUUID } from "crypto";
import sjcl from "sjcl";
import tweetnacl from "tweetnacl";
import tweetnaclUtil from "tweetnacl-util";

import { SecretType } from "@app/db/schemas";
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

  folderDAL: Pick<TSecretFolderDALFactory, "create" | "findBySecretPath">;
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

  // environments
  for (const env of parsedJson.baseEnvironments) {
    infisicalImportData.environments.push({
      id: env.id,
      name: envTemplates.get(env.environmentRoleId)!,
      projectId: env.envParentId
    });
  }

  // secrets
  for (const env of Object.keys(parsedJson.envs)) {
    if (!env.includes("|")) {
      const envData = parsedJson.envs[env];
      for (const secret of Object.keys(envData.variables)) {
        infisicalImportData.secrets.push({
          id: randomUUID(),
          name: secret,
          environmentId: env,
          value: envData.variables[secret].val
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
  const originalToNewEnvironmentId = new Map<string, string>();

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
        const projectId = originalToNewProjectId.get(environment.projectId)!;
        const slug = slugify(`${environment.name}-${alphaNumericNanoId(4)}`);

        const existingEnv = await projectEnvDAL.findOne({ projectId, slug }, tx);

        if (existingEnv) {
          throw new BadRequestError({
            message: `Environment with slug '${slug}' already exist`,
            name: "CreateEnvironment"
          });
        }

        const lastPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
        const doc = await projectEnvDAL.create({ slug, name: environment.name, projectId, position: lastPos + 1 }, tx);
        await folderDAL.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);

        originalToNewEnvironmentId.set(environment.id, doc.slug);
      }
    }

    if (data.secrets && data.secrets.length > 0) {
      const mappedToEnvironmentId = new Map<
        string,
        {
          secretKey: string;
          secretValue: string;
        }[]
      >();

      for (const secret of data.secrets) {
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
        const environment = data.environments.find((env) => env.id === envId);
        const projectId = originalToNewProjectId.get(environment?.projectId as string)!;

        if (!projectId) {
          throw new BadRequestError({ message: `Failed to import secret, project not found` });
        }

        const { encryptor: secretManagerEncrypt } = await kmsService.createCipherPairWithDataKey(
          {
            type: KmsDataKey.SecretManager,
            projectId
          },
          tx
        );

        const envSlug = originalToNewEnvironmentId.get(envId)!;
        const folder = await folderDAL.findBySecretPath(projectId, envSlug, "/", tx);
        if (!folder)
          throw new NotFoundError({
            message: `Folder not found for the given environment slug (${envSlug}) & secret path (/)`,
            name: "Create secret"
          });

        const secretsByKeys = await secretDAL.findBySecretKeys(
          folder.id,
          secrets.map((el) => ({
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

        const secretBatches = chunkArray(secrets, 2500);
        for await (const secretBatch of secretBatches) {
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
            folderId: folder.id,
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
};
