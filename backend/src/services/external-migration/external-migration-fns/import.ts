import slugify from "@sindresorhus/slugify";

import { SecretType } from "@app/db/schemas/models";
import { TSecretFolders } from "@app/db/schemas/secret-folders";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { CommitType } from "@app/services/folder-commit/folder-commit-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { fnSecretBulkInsert, getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

import { TImportDataIntoInfisicalDTO } from "./envkey";

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
    { envId: string; envSlug: string; rootFolderId?: string; projectId: string }
  >();
  const originalToNewFolderId = new Map<
    string,
    {
      envId: string;
      envSlug: string;
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
          projectName: project.name,
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
            message: `Environment with slug '${slug}' already exists`,
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
        const parentFolder = originalToNewFolderId.get(folder.parentFolderId as string);

        let newFolder: TSecretFolders;

        if (parentEnv?.rootFolderId) {
          newFolder = await folderDAL.create(
            {
              name: folder.name,
              envId: parentEnv.envId,
              parentId: parentEnv.rootFolderId
            },
            tx
          );
        } else if (parentFolder) {
          newFolder = await folderDAL.create(
            {
              name: folder.name,
              envId: parentFolder.envId,
              parentId: parentFolder.folderId
            },
            tx
          );
        } else {
          logger.info({ folder }, "No parent environment found for folder");
          // eslint-disable-next-line no-continue
          continue;
        }

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
            folderId: parentEnv?.rootFolderId || parentFolder?.folderId || "",
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
          envId: parentEnv?.envId || parentFolder?.envId || "",
          envSlug: parentEnv?.envSlug || parentFolder?.envSlug || "",
          projectId: parentEnv?.projectId || parentFolder?.projectId || ""
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
              message: `Secret already exists: ${secretsByKeys.map((el) => el.key).join(",")}`
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
