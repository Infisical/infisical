import { ForbiddenError, subject } from "@casl/ability";

import {
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSecretBlindIndexes,
  TSecrets
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { buildSecretBlindIndexFromName } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TSecretBlindIndexDalFactory } from "./secret-blind-index-dal";
import { TSecretDalFactory } from "./secret-dal";
import {
  TCreateBulkSecretDTO,
  TCreateSecretDTO,
  TDeleteBulkSecretDTO,
  TDeleteSecretDTO,
  TGetASecretDTO,
  TGetSecretsDTO,
  TUpdateBulkSecretDTO,
  TUpdateSecretDTO
} from "./secret-types";
import { TSecretVersionDalFactory } from "./secret-version-dal";

type TSecretServiceFactoryDep = {
  secretDal: TSecretDalFactory;
  secretVersionDal: TSecretVersionDalFactory;
  folderDal: TSecretFolderDalFactory;
  secretBlindIndexDal: TSecretBlindIndexDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSecretServiceFactory = ReturnType<typeof secretServiceFactory>;

export const secretServiceFactory = ({
  secretDal,
  secretVersionDal,
  folderDal,
  secretBlindIndexDal,
  permissionService
}: TSecretServiceFactoryDep) => {
  const generateSecretBlindIndexBySalt = async (
    secretName: string,
    secretBlindIndexDoc: TSecretBlindIndexes
  ) => {
    const appCfg = getConfig();
    const secretBlindIndex = await buildSecretBlindIndexFromName({
      secretName,
      keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
      rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
      encryptionKey: appCfg.ENCRYPTION_KEY,
      tag: secretBlindIndexDoc.saltTag,
      ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
      iv: secretBlindIndexDoc.saltIV
    });
    return secretBlindIndex;
  };

  // utility function to get secret blind index data
  const generateSecretBlindIndexByName = async (projectId: string, secretName: string) => {
    const appCfg = getConfig();

    const secretBlindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!secretBlindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Create secret" });

    const secretBlindIndex = await buildSecretBlindIndexFromName({
      secretName,
      keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
      rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
      encryptionKey: appCfg.ENCRYPTION_KEY,
      tag: secretBlindIndexDoc.saltTag,
      ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
      iv: secretBlindIndexDoc.saltIV
    });
    if (!secretBlindIndex) throw new BadRequestError({ message: "Secret not found" });
    return secretBlindIndex;
  };

  const createSecret = async ({
    path,
    actor,
    actorId,
    environment,
    projectId,
    ...inputSecret
  }: TCreateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const secretBlindIndex = await generateSecretBlindIndexByName(
      projectId,
      inputSecret.secretName
    );
    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const existingSecret = await secretDal.findOne({
      secretBlindIndex,
      folderId,
      type: inputSecret.type,
      userId: inputSecret.type === SecretType.Personal ? actorId : null
    });
    if (existingSecret) throw new BadRequestError({ message: "Secret already exist" });
    // if user creating personal check its shared also exist
    if (inputSecret.type === SecretType.Personal) {
      const sharedExist = await secretDal.findOne({
        secretBlindIndex,
        folderId,
        type: SecretType.Shared
      });
      if (!sharedExist)
        throw new BadRequestError({
          message: "Failed to create personal secret override for no corresponding shared secret"
        });
    }

    const secret = await secretDal.transaction(async (tx) => {
      const { secretName, type, ...el } = inputSecret;
      const doc = await secretDal.create(
        {
          version: 1,
          folderId,
          secretBlindIndex,
          type,
          ...el,
          userId: inputSecret.type === SecretType.Personal ? actorId : null,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8
        },
        tx
      );
      await secretVersionDal.create(
        {
          secretBlindIndex,
          folderId,
          version: 1,
          type,
          ...el,
          userId: inputSecret.type === SecretType.Personal ? actorId : null,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8,
          secretId: doc.id
        },
        tx
      );
      return doc;
    });

    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return secret;
  };

  const updateSecret = async ({
    path,
    actor,
    actorId,
    environment,
    projectId,
    ...inputSecret
  }: TUpdateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const blindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });
    const oldBlindIndex = await generateSecretBlindIndexBySalt(
      inputSecret.secretName,
      blindIndexDoc
    );
    if (!oldBlindIndex) throw new BadRequestError({ message: "Secret not found" });

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    let newSecretNameBlindIndex: string;
    if (inputSecret?.newSecretName && inputSecret.type === SecretType.Shared) {
      newSecretNameBlindIndex = await generateSecretBlindIndexBySalt(
        inputSecret.newSecretName,
        blindIndexDoc
      );
      const doesSecretExist = await secretDal.findOne({
        secretBlindIndex: newSecretNameBlindIndex,
        folderId,
        type: inputSecret.type
      });
      if (doesSecretExist) {
        throw new BadRequestError({ message: "Secret with the provided name already exist" });
      }
    }

    const updatedSecret = await secretDal.transaction(async (tx) => {
      const { secretName, ...el } = inputSecret;
      const [doc] = await secretDal.update(
        {
          secretBlindIndex: oldBlindIndex,
          folderId,
          type: inputSecret.type,
          userId: inputSecret.type === SecretType.Personal ? actorId : null
        },
        {
          secretBlindIndex: newSecretNameBlindIndex,
          ...el
        },
        tx
      );
      const { id, createdAt, updatedAt, ...newVersion } = doc;
      await secretVersionDal.create(
        {
          userId: inputSecret.type === SecretType.Personal ? actorId : null,
          secretId: doc.id,
          ...newVersion
        },
        tx
      );
      return doc;
    });

    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return updatedSecret;
  };

  const deleteSecret = async ({
    path,
    actor,
    actorId,
    environment,
    projectId,
    ...inputSecret
  }: TDeleteSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const secretBlindIndex = await generateSecretBlindIndexByName(
      projectId,
      inputSecret.secretName
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const deletedSecret = await secretDal.transaction(async (tx) => {
      const [doc] = await secretDal.delete(
        {
          secretBlindIndex,
          folderId,
          type: inputSecret.type,
          userId: inputSecret.type === SecretType.Personal ? actorId : null
        },
        tx
      );
      return doc;
    });

    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return deletedSecret;
  };

  const getSecrets = async ({ actorId, path, environment, projectId, actor }: TGetSecretsDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const secrets = await secretDal.findByFolderId(folderId, actorId);

    return secrets;
  };

  const getASecret = async ({
    actorId,
    actor,
    projectId,
    environment,
    path,
    type,
    secretName
  }: TGetASecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );
    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const secretBlindIndex = await generateSecretBlindIndexByName(projectId, secretName);

    const secret = await secretDal.findOne({
      folderId,
      type,
      userId: type === SecretType.Personal ? actorId : null,
      secretBlindIndex
    });
    if (!secret) throw new BadRequestError({ message: "Secret not found" });

    return secret;
  };

  const createManySecret = async ({
    path,
    actor,
    actorId,
    environment,
    projectId,
    secrets: inputSecrets
  }: TCreateBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
    const secretBlindIndexes = await Promise.all(
      inputSecrets.map(({ secretName }) =>
        generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        // eslint-disable-next-line
        prev[inputSecrets[i].secretName] = curr;
        secretBlindIndexToKey[curr] = inputSecrets[i].secretName;
        return prev;
      }, {})
    );

    const exists = await secretDal.findByBlindIndexes(
      folderId,
      inputSecrets.map(({ type, secretName }) => ({
        blindIndex: secretBlindIndexes[secretName],
        type
      }))
    );
    if (exists.length) throw new BadRequestError({ message: "Secret already exist" });

    const secrets = await secretDal.transaction(async (tx) => {
      const newSecrets = await secretDal.insertMany(
        inputSecrets.map(({ secretName, type, ...el }) => ({
          version: 1,
          folderId,
          type,
          secretBlindIndex: secretBlindIndexes[secretName],
          ...el,
          userId: type === SecretType.Personal ? actorId : null,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8
        })),
        tx
      );
      await secretVersionDal.insertMany(
        newSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
          ...el,
          secretId: id
        })),
        tx
      );

      return newSecrets;
    });
    return secrets;
  };

  const updateManySecret = async ({
    path,
    actor,
    actorId,
    environment,
    projectId,
    secrets: inputSecrets
  }: TUpdateBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    // get all blind index
    // Find all those secrets
    // if not throw not found
    const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
    const secretBlindIndexes = await Promise.all(
      inputSecrets.map(({ secretName }) =>
        generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        // eslint-disable-next-line
        prev[inputSecrets[i].secretName] = curr;
        secretBlindIndexToKey[curr] = inputSecrets[i].secretName;
        return prev;
      }, {})
    );

    const secretsToBeUpdated = await secretDal.findByBlindIndexes(
      folderId,
      inputSecrets.map(({ type, secretName }) => ({
        blindIndex: secretBlindIndexes[secretName],
        type
      }))
    );
    if (secretsToBeUpdated.length !== inputSecrets.length)
      throw new BadRequestError({ message: "Secret not found" });

    // now find any secret that needs to update its name
    // same process as above
    const nameUpdatedSecrets = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    const newSecretBlindIndexes = await Promise.all(
      nameUpdatedSecrets.map(({ newSecretName }) =>
        generateSecretBlindIndexBySalt(newSecretName as string, blindIndexDoc)
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        // eslint-disable-next-line
        prev[nameUpdatedSecrets[i].secretName] = curr;
        return prev;
      }, {})
    );
    const secretsWithNewName = await secretDal.findByBlindIndexes(
      folderId,
      nameUpdatedSecrets.map(({ type, newSecretName }) => ({
        blindIndex: newSecretBlindIndexes[newSecretName as string],
        type
      }))
    );
    if (secretsWithNewName.length) throw new BadRequestError({ message: "Secret not found" });

    const secretsGroupedByBlindIndex = secretsToBeUpdated.reduce<Record<string, TSecrets>>(
      (prev, curr) => {
        // eslint-disable-next-line
        if (curr.secretBlindIndex) prev[curr.secretBlindIndex] = curr;
        return prev;
      },
      {}
    );

    const secrets = await secretDal.transaction(async (tx) => {
      const newSecrets = await secretDal.bulkUpdate(
        inputSecrets.map(({ secretName, type, ...el }) => {
          const { version, updatedAt, ...info } =
            secretsGroupedByBlindIndex[secretBlindIndexes[secretName]];
          return {
            version: (version || 0) + 1,
            ...info,
            folderId,
            type,
            secretBlindIndex:
              el?.newSecretName && newSecretBlindIndexes[el.newSecretName]
                ? newSecretBlindIndexes[el.newSecretName]
                : secretBlindIndexes[secretName],
            ...el,
            userId: type === SecretType.Personal ? actorId : null,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8
          };
        }),
        tx
      );
      await secretVersionDal.insertMany(
        newSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
          ...el,
          secretId: id
        })),
        tx
      );

      return newSecrets;
    });
    return secrets;
  };

  const deleteManySecret = async ({
    secrets: inputSecrets,
    path,
    environment,
    projectId,
    actor,
    actorId
  }: TDeleteBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    // get all blind index
    // Find all those secrets
    // if not throw not found
    const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
    const secretBlindIndexes = await Promise.all(
      inputSecrets.map(({ secretName }) =>
        generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        // eslint-disable-next-line
        prev[inputSecrets[i].secretName] = curr;
        secretBlindIndexToKey[curr] = inputSecrets[i].secretName;
        return prev;
      }, {})
    );
    // not find those secrets. if any of them not found throw an not found error
    const secretsToBeDeleted = await secretDal.findByBlindIndexes(
      folderId,
      inputSecrets.map(({ type, secretName }) => ({
        blindIndex: secretBlindIndexes[secretName],
        type
      }))
    );
    if (secretsToBeDeleted.length !== inputSecrets.length)
      throw new BadRequestError({ message: "Secret not found" });
    const secretsDeleted = await secretDal.transaction(async (tx) =>
      secretDal.deleteMany(
        inputSecrets.map(({ type, secretName }) => ({
          blindIndex: secretBlindIndexes[secretName],
          type
        })),
        folderId,
        actorId,
        tx
      )
    );

    return secretsDeleted;
  };

  return {
    createSecret,
    deleteSecret,
    updateSecret,
    createManySecret,
    updateManySecret,
    deleteManySecret,
    getASecret,
    getSecrets
  };
};
