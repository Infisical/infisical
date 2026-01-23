import { ForbiddenError, subject } from "@casl/ability";
import Ajv from "ajv";

import { ActionProjectType, ProjectVersion, TableName } from "@app/db/schemas/models";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TSecretRotationDALFactory } from "./secret-rotation-dal";
import { TSecretRotationQueueFactory } from "./secret-rotation-queue";
import { TSecretRotationEncData } from "./secret-rotation-queue/secret-rotation-queue-types";
import { TCreateSecretRotationDTO, TDeleteDTO, TListByProjectIdDTO, TRestartDTO } from "./secret-rotation-types";
import { rotationTemplates } from "./templates";

type TSecretRotationServiceFactoryDep = {
  secretRotationDAL: TSecretRotationDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretRotationQueue: TSecretRotationQueueFactory;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretRotationServiceFactory = ReturnType<typeof secretRotationServiceFactory>;

const ajv = new Ajv({ strict: false });
export const secretRotationServiceFactory = ({
  secretRotationDAL,
  permissionService,
  secretRotationQueue,
  licenseService,
  projectDAL,
  folderDAL,
  secretDAL,
  projectBotService,
  secretV2BridgeDAL,
  kmsService
}: TSecretRotationServiceFactoryDep) => {
  const getProviderTemplates = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSub.SecretRotation
    );

    return {
      custom: [],
      providers: rotationTemplates
    };
  };

  const createRotation = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    inputs,
    outputs,
    interval,
    provider,
    secretPath,
    environment
  }: TCreateSecretRotationDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSub.SecretRotation
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Secret path with path '${secretPath}' not found in environment with slug '${environment}'`
      });
    }
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const project = await projectDAL.findById(projectId);
    const shouldUseBridge = project.version === ProjectVersion.V3;

    if (shouldUseBridge) {
      const selectedSecrets = await secretV2BridgeDAL.find({
        folderId: folder.id,
        $in: { [`${TableName.SecretV2}.id` as "id"]: Object.values(outputs) }
      });
      if (selectedSecrets.length !== Object.values(outputs).length)
        throw new NotFoundError({ message: `Secrets not found in folder with ID '${folder.id}'` });
      const rotatedSecrets = selectedSecrets.filter(({ isRotatedSecret }) => isRotatedSecret);
      if (rotatedSecrets.length)
        throw new BadRequestError({
          message: `Selected secrets are already used for rotation: ${rotatedSecrets
            .map((secret) => secret.key)
            .join(", ")}`
        });
    } else {
      const selectedSecrets = await secretDAL.find({
        folderId: folder.id,
        $in: { id: Object.values(outputs) }
      });
      if (selectedSecrets.length !== Object.values(outputs).length)
        throw new NotFoundError({ message: `Secrets not found in folder with ID '${folder.id}'` });
    }

    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to add secret rotation due to plan restriction. Upgrade plan to add secret rotation."
      });

    const selectedTemplate = rotationTemplates.find(({ name }) => name === provider);
    if (!selectedTemplate) throw new NotFoundError({ message: `Provider with name '${provider}' not found` });
    const formattedInputs: Record<string, unknown> = {};
    Object.entries(inputs).forEach(([key, value]) => {
      const { type } = selectedTemplate.template.inputs.properties[key];
      if (type === "string") {
        formattedInputs[key] = value;
        return;
      }
      if (type === "integer") {
        formattedInputs[key] = parseInt(value as string, 10);
        return;
      }
      formattedInputs[key] = JSON.parse(value as string);
    });
    // ensure input one follows the correct schema
    const valid = ajv.validate(selectedTemplate.template.inputs, formattedInputs);
    if (!valid) {
      throw new BadRequestError({ message: ajv.errors?.[0].message });
    }

    const unencryptedData: Partial<TSecretRotationEncData> = {
      inputs: formattedInputs,
      creds: []
    };
    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const secretRotation = await secretRotationDAL.transaction(async (tx) => {
      const doc = await secretRotationDAL.create(
        {
          provider,
          secretPath,
          interval,
          envId: folder.envId,
          encryptedRotationData: secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(unencryptedData)) })
            .cipherTextBlob
        },
        tx
      );
      let outputSecretMapping;
      if (shouldUseBridge) {
        outputSecretMapping = await secretRotationDAL.secretOutputV2InsertMany(
          Object.entries(outputs).map(([key, secretId]) => ({ key, secretId, rotationId: doc.id })),
          tx
        );
      } else {
        outputSecretMapping = await secretRotationDAL.secretOutputInsertMany(
          Object.entries(outputs).map(([key, secretId]) => ({ key, secretId, rotationId: doc.id })),
          tx
        );
      }
      return { ...doc, outputs: outputSecretMapping, environment: folder.environment };
    });
    await secretRotationQueue.addToQueue(secretRotation.id, secretRotation.interval);
    return secretRotation;
  };

  const getByProjectId = async ({ actorId, projectId, actor, actorOrgId, actorAuthMethod }: TListByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSub.SecretRotation
    );
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const docs = await secretRotationDAL.findSecretV2({ projectId });
      return docs;
    }

    if (!botKey) throw new NotFoundError({ message: `Project bot not found for project with ID '${projectId}'` });
    const docs = await secretRotationDAL.find({ projectId });

    return docs.map((el) => ({
      ...el,
      outputs: el.outputs.map((output) => ({
        ...output,
        secret: {
          id: output.secret.id,
          version: output.secret.version,
          secretKey: crypto.encryption().symmetric().decrypt({
            ciphertext: output.secret.secretKeyCiphertext,
            iv: output.secret.secretKeyIV,
            tag: output.secret.secretKeyTag,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          })
        }
      }))
    }));
  };

  const restartById = async ({ actor, actorId, actorOrgId, actorAuthMethod, rotationId }: TRestartDTO) => {
    const doc = await secretRotationDAL.findById(rotationId);
    if (!doc) throw new NotFoundError({ message: `Rotation with ID '${rotationId}' not found` });

    const project = await projectDAL.findById(doc.projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to add secret rotation due to plan restriction. Upgrade plan to add secret rotation."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Edit,
      ProjectPermissionSub.SecretRotation
    );
    await secretRotationQueue.removeFromQueue(doc.id, doc.interval);
    await secretRotationQueue.addToQueue(doc.id, doc.interval);
    return doc;
  };

  const deleteById = async ({ actor, actorId, actorOrgId, actorAuthMethod, rotationId }: TDeleteDTO) => {
    const doc = await secretRotationDAL.findById(rotationId);
    if (!doc) throw new NotFoundError({ message: `Rotation with ID '${rotationId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: doc.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Delete,
      ProjectPermissionSub.SecretRotation
    );
    const deletedDoc = await secretRotationDAL.transaction(async (tx) => {
      const strat = await secretRotationDAL.deleteById(rotationId, tx);
      return strat;
    });
    await secretRotationQueue.removeFromQueue(deletedDoc.id, deletedDoc.interval);
    return { ...doc, ...deletedDoc };
  };

  return {
    getProviderTemplates,
    getByProjectId,
    createRotation,
    restartById,
    deleteById
  };
};
