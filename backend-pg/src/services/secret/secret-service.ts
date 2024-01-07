import { ForbiddenError, subject } from "@casl/ability";

import {
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TableName,
  TSecretBlindIndexes
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { getConfig } from "@app/lib/config/env";
import { buildSecretBlindIndexFromName } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { groupBy, pick } from "@app/lib/fn";

import { ActorType } from "../auth/auth-type";
import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TSecretTagDalFactory } from "../secret-tag/secret-tag-dal";
import { TSecretBlindIndexDalFactory } from "./secret-blind-index-dal";
import { TSecretDalFactory } from "./secret-dal";
import {
  TCreateBulkSecretDTO,
  TCreateSecretDTO,
  TDeleteBulkSecretDTO,
  TDeleteSecretDTO,
  TFnSecretBlindIndexCheck,
  TFnSecretBulkDelete,
  TFnSecretBulkInsert,
  TFnSecretBulkUpdate,
  TGetASecretDTO,
  TGetSecretsDTO,
  TListSecretVersionDTO,
  TUpdateBulkSecretDTO,
  TUpdateSecretDTO
} from "./secret-types";
import { TSecretVersionDalFactory } from "./secret-version-dal";

type TSecretServiceFactoryDep = {
  secretDal: TSecretDalFactory;
  secretTagDal: TSecretTagDalFactory;
  secretVersionDal: TSecretVersionDalFactory;
  folderDal: Pick<TSecretFolderDalFactory, "findBySecretPath" | "updateById" | "findById">;
  secretBlindIndexDal: TSecretBlindIndexDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
};

export type TSecretServiceFactory = ReturnType<typeof secretServiceFactory>;

export const generateSecretBlindIndexBySalt = async (
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

export const secretServiceFactory = ({
  secretDal,
  secretTagDal,
  secretVersionDal,
  folderDal,
  secretBlindIndexDal,
  permissionService,
  snapshotService
}: TSecretServiceFactoryDep) => {
  // utility function to get secret blind index data
  const interalGenSecBlindIndexByName = async (projectId: string, secretName: string) => {
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

  // these functions are special functions shared by a couple of resources
  // used by secret approval, rotation or anywhere in which secret needs to modified
  const fnSecretBulkInsert = async ({ folderId, inputSecrets, tx }: TFnSecretBulkInsert) => {
    const newSecrets = await secretDal.insertMany(
      inputSecrets.map(({ tags, ...el }) => ({ ...el, folderId })),
      tx
    );
    const newSecretGroupByBlindIndex = groupBy(newSecrets, (item) => item.secretBlindIndex);
    const newSecretTags = inputSecrets.flatMap(({ tags: secretTags = [], secretBlindIndex }) =>
      secretTags.map((tag) => ({
        [`${TableName.SecretTag}Id`]: tag,
        [`${TableName.Secret}Id`]: newSecretGroupByBlindIndex[secretBlindIndex][0].id
      }))
    );
    if (newSecretTags.length) {
      await secretTagDal.saveTagsToSecret(newSecretTags, tx);
    }
    await secretVersionDal.insertMany(
      inputSecrets.map(({ tags, ...el }) => ({
        ...el,
        folderId,
        secretId: newSecretGroupByBlindIndex[el.secretBlindIndex][0].id
      })),
      tx
    );

    return newSecrets;
  };

  const fnSecretBulkUpdate = async ({
    tx,
    inputSecrets,
    folderId,
    projectId
  }: TFnSecretBulkUpdate) => {
    const newSecrets = await secretDal.bulkUpdate(
      inputSecrets.map(({ tags, ...el }) => ({ ...el, folderId })),
      tx
    );
    const secsUpdatedTag = inputSecrets.filter(({ tags }) => Boolean(tags));
    if (secsUpdatedTag.length) {
      await secretTagDal.deleteTagsManySecret(
        projectId,
        secsUpdatedTag.map(({ id }) => id),
        tx
      );
      const newSecretTags = secsUpdatedTag.flatMap(({ tags: secretTags = [], id }) =>
        secretTags.map((tag) => ({
          [`${TableName.SecretTag}Id`]: tag,
          [`${TableName.Secret}Id`]: id
        }))
      );
      await secretTagDal.saveTagsToSecret(newSecretTags, tx);
    }
    await secretVersionDal.insertMany(
      newSecrets.map(({ id, createdAt, updatedAt, ...el }) => ({
        ...el,
        secretId: id
      })),
      tx
    );

    return newSecrets;
  };

  const fnSecretBulkDelete = async ({
    folderId,
    inputSecrets,
    tx,
    actorId
  }: TFnSecretBulkDelete) => {
    const deletedSecrets = await secretDal.deleteMany(
      inputSecrets.map(({ type, secretBlindIndex }) => ({
        blindIndex: secretBlindIndex,
        type
      })),
      folderId,
      actorId,
      tx
    );
    return deletedSecrets;
  };

  // this is a utility function for secret modification
  // this will check given secret name blind index exist or not
  // if its a created secret set isNew to true
  // thus if these blindindex exist it will throw an error
  // vice versa when u need to check for updated secret
  // this will also return the blind index grouped by secretName
  const fnSecretBlindIndexCheck = async ({
    inputSecrets,
    folderId,
    isNew,
    userId,
    blindIndexCfg
  }: TFnSecretBlindIndexCheck) => {
    const blindIndex2KeyName: Record<string, string> = {}; // used at audit log point
    const keyName2BlindIndex = await Promise.all(
      inputSecrets.map(({ secretName }) =>
        generateSecretBlindIndexBySalt(secretName, blindIndexCfg)
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        // eslint-disable-next-line
        prev[inputSecrets[i].secretName] = curr;
        blindIndex2KeyName[curr] = inputSecrets[i].secretName;
        return prev;
      }, {})
    );
    if (inputSecrets.some(({ type }) => type === SecretType.Personal) && !userId) {
      throw new BadRequestError({ message: "Missing user id for personal secret" });
    }

    const secrets = await secretDal.findByBlindIndexes(
      folderId,
      inputSecrets.map(({ secretName, type }) => ({
        blindIndex: keyName2BlindIndex[secretName],
        type: type || SecretType.Shared
      })),
      userId
    );

    if (isNew) {
      if (secrets.length) throw new BadRequestError({ message: "Secret already exist" });
    } else if (secrets.length !== inputSecrets.length)
      throw new BadRequestError({ message: "Secret not found" });

    return { blindIndex2KeyName, keyName2BlindIndex, secrets };
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

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName }],
      folderId,
      isNew: true,
      blindIndexCfg
    });

    // if user creating personal check its shared also exist
    if (inputSecret.type === SecretType.Personal) {
      const sharedExist = await secretDal.findOne({
        secretBlindIndex: keyName2BlindIndex[inputSecret.secretName],
        folderId,
        type: SecretType.Shared
      });
      if (!sharedExist)
        throw new BadRequestError({
          message: "Failed to create personal secret override for no corresponding shared secret"
        });
    }

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const tags = inputSecret.tags
      ? await secretTagDal.findManyTagsById(projectId, inputSecret.tags)
      : [];
    if ((inputSecret.tags || []).length !== tags.length)
      throw new BadRequestError({ message: "Tag not found" });

    const { secretName, type, ...el } = inputSecret;
    const secret = await secretDal.transaction((tx) =>
      fnSecretBulkInsert({
        folderId,
        inputSecrets: [
          {
            version: 1,
            secretBlindIndex: keyName2BlindIndex[secretName],
            type,
            ...el,
            userId: inputSecret.type === SecretType.Personal ? actorId : null,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8,
            tags: inputSecret.tags
          }
        ],
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return { ...secret[0], tags };
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

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { secrets, keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName, type: inputSecret.type as SecretType }],
      folderId,
      isNew: false,
      blindIndexCfg,
      userId: actorId
    });
    if (inputSecret.newSecretName && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Personal secret cannot change the key name" });
    }

    let newSecretNameBlindIndex: string | undefined;
    if (inputSecret?.newSecretName) {
      const { keyName2BlindIndex: kN2NewBlindIndex } = await fnSecretBlindIndexCheck({
        inputSecrets: [{ secretName: inputSecret.newSecretName }],
        folderId,
        isNew: true,
        blindIndexCfg
      });
      newSecretNameBlindIndex = kN2NewBlindIndex[inputSecret.newSecretName];
    }

    const tags = inputSecret.tags
      ? await secretTagDal.findManyTagsById(projectId, inputSecret.tags)
      : [];
    if ((inputSecret.tags || []).length !== tags.length)
      throw new BadRequestError({ message: "Tag not found" });

    const { secretName, ...el } = inputSecret;
    const updatedSecret = await secretDal.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        projectId,
        inputSecrets: [
          {
            id: secrets[0].id,
            version: (secrets[0].version || 0) + 1,
            ...pick(el, [
              "type",
              "secretCommentCiphertext",
              "secretCommentTag",
              "secretCommentIV",
              "secretValueIV",
              "secretValueTag",
              "secretValueCiphertext",
              "secretKeyCiphertext",
              "secretKeyTag",
              "secretKeyIV",
              "metadata",
              "skipMultilineEncoding",
              "secretReminderNote",
              "secretReminderRepeatDays",
              "tags"
            ]),
            secretBlindIndex: newSecretNameBlindIndex || keyName2BlindIndex[secretName]
          }
        ],
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);

    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return updatedSecret[0];
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

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "Create secret" });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName }],
      folderId,
      isNew: false,
      blindIndexCfg
    });

    const deletedSecret = await secretDal.transaction(async (tx) =>
      fnSecretBulkDelete({
        projectId,
        folderId,
        actorId,
        inputSecrets: [
          {
            type: inputSecret.type as SecretType,
            secretBlindIndex: keyName2BlindIndex[inputSecret.secretName]
          }
        ],
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);

    // TODO(akhilmhdh-pg): licence check, posthog service and snapshot
    return deletedSecret[0];
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

    const secretBlindIndex = await interalGenSecBlindIndexByName(projectId, secretName);

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

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: true,
      blindIndexCfg
    });

    // get all tags
    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDal.findManyTagsById(projectId, tagIds) : [];
    if (tags.length !== tagIds.length) throw new BadRequestError({ message: "Tag not found" });

    const newSecrets = await secretDal.transaction(async (tx) =>
      fnSecretBulkInsert({
        inputSecrets: inputSecrets.map(({ secretName, ...el }) => ({
          ...el,
          secretBlindIndex: keyName2BlindIndex[secretName],
          type: SecretType.Shared,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8
        })),
        folderId,
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    return newSecrets;
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

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex, secrets: secretsToBeUpdated } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: false,
      blindIndexCfg
    });

    // now find any secret that needs to update its name
    // same process as above
    const nameUpdatedSecrets = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    const { keyName2BlindIndex: newKeyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: nameUpdatedSecrets,
      folderId,
      isNew: true,
      blindIndexCfg
    });

    const secsGroupedByBlindIndex = groupBy(secretsToBeUpdated, (el) => el.secretBlindIndex);
    // get all tags
    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDal.findManyTagsById(projectId, tagIds) : [];
    if (tagIds.length !== tags.length) throw new BadRequestError({ message: "Tag not found" });
    const secrets = await secretDal.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        projectId,
        tx,
        inputSecrets: inputSecrets.map(({ secretName, newSecretName, ...el }) => {
          const { version, updatedAt, ...info } =
            secsGroupedByBlindIndex[keyName2BlindIndex[secretName]][0];
          return {
            ...el,
            version: (version || 0) + 1,
            ...info,
            folderId,
            type: SecretType.Shared,
            secretBlindIndex:
              newSecretName && newKeyName2BlindIndex[newSecretName]
                ? newKeyName2BlindIndex[newSecretName]
                : keyName2BlindIndex[secretName],
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8
          };
        })
      })
    );

    await snapshotService.performSnapshot(folderId);
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

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: false,
      blindIndexCfg
    });

    const secretsDeleted = await secretDal.transaction(async (tx) =>
      fnSecretBulkDelete({
        inputSecrets: inputSecrets.map(({ type, secretName }) => ({
          secretBlindIndex: keyName2BlindIndex[secretName],
          type
        })),
        projectId,
        folderId,
        actorId,
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    return secretsDeleted;
  };

  const listSecretVersionsBySecretId = async ({
    actorId,
    actor,
    limit,
    offset,
    secretId
  }: TListSecretVersionDTO) => {
    const secret = await secretDal.findById(secretId);
    if (!secret) throw new BadRequestError({ message: "Failed to find secret" });

    const folder = await folderDal.findById(secret.folderId);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      folder.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRollback
    );

    const secretVersions = await secretVersionDal.find(
      { secretId },
      { limit, offset, sort: [["createdAt", "desc"]] }
    );
    return secretVersions;
  };

  return {
    createSecret,
    deleteSecret,
    updateSecret,
    createManySecret,
    updateManySecret,
    deleteManySecret,
    getASecret,
    getSecrets,
    listSecretVersionsBySecretId,
    // external services function
    fnSecretBulkDelete,
    fnSecretBulkUpdate,
    fnSecretBlindIndexCheck,
    fnSecretBulkInsert
  };
};
