import { ForbiddenError, subject } from "@casl/ability";
import Ajv from "ajv";

import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TSecretRotationDALFactory } from "./secret-rotation-dal";
import { TSecretRotationQueueFactory } from "./secret-rotation-queue";
import { TSecretRotationEncData } from "./secret-rotation-queue/secret-rotation-queue-types";
import {
  TCreateSecretRotationDTO,
  TDeleteDTO,
  TGetByIdDTO,
  TListByProjectIdDTO,
  TRestartDTO
} from "./secret-rotation-types";
import { rotationTemplates } from "./templates";

type TSecretRotationServiceFactoryDep = {
  secretRotationDAL: TSecretRotationDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretRotationQueue: TSecretRotationQueueFactory;
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
  secretDAL
}: TSecretRotationServiceFactoryDep) => {
  const getProviderTemplates = async ({ actor, actorId, projectId }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
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
    inputs,
    outputs,
    interval,
    provider,
    secretPath,
    environment
  }: TCreateSecretRotationDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRotation
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Secret path not found" });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const selectedSecrets = await secretDAL.find({
      folderId: folder.id,
      $in: { id: Object.values(outputs) }
    });
    if (selectedSecrets.length !== Object.values(outputs).length)
      throw new BadRequestError({ message: "Secrets not found" });

    const project = await projectDAL.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.secretRotation)
      throw new BadRequestError({
        message:
          "Failed to add secret rotation due to plan restriction. Upgrade plan to add secret rotation."
      });

    const selectedTemplate = rotationTemplates.find(({ name }) => name === provider);
    if (!selectedTemplate) throw new BadRequestError({ message: "Provider not found" });
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
    const encData = infisicalSymmetricEncypt(JSON.stringify(unencryptedData));
    const secretRotation = secretRotationDAL.transaction(async (tx) => {
      const doc = await secretRotationDAL.create(
        {
          provider,
          secretPath,
          interval,
          envId: folder.envId,
          encryptedDataTag: encData.tag,
          encryptedDataIV: encData.iv,
          encryptedData: encData.ciphertext,
          algorithm: encData.algorithm,
          keyEncoding: encData.encoding
        },
        tx
      );
      await secretRotationQueue.addToQueue(doc.id, doc.interval);
      const outputSecretMapping = await secretRotationDAL.secretOutputInsertMany(
        Object.entries(outputs).map(([key, secretId]) => ({ key, secretId, rotationId: doc.id })),
        tx
      );
      return { ...doc, outputs: outputSecretMapping, environment: folder.environment };
    });
    return secretRotation;
  };

  const getById = async ({ rotationId, actor, actorId }: TGetByIdDTO) => {
    const [doc] = await secretRotationDAL.find({ id: rotationId });
    if (!doc) throw new BadRequestError({ message: "Rotation not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      doc.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRotation
    );
    return doc;
  };

  const getByProjectId = async ({ actorId, projectId, actor }: TListByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRotation
    );
    const doc = await secretRotationDAL.find({ projectId });
    return doc;
  };

  const restartById = async ({ actor, actorId, rotationId }: TRestartDTO) => {
    const doc = await secretRotationDAL.findById(rotationId);
    if (!doc) throw new BadRequestError({ message: "Rotation not found" });

    const project = await projectDAL.findById(doc.projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.secretRotation)
      throw new BadRequestError({
        message:
          "Failed to add secret rotation due to plan restriction. Upgrade plan to add secret rotation."
      });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      doc.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.SecretRotation
    );
    await secretRotationQueue.removeFromQueue(doc.id, doc.interval);
    await secretRotationQueue.addToQueue(doc.id, doc.interval);
    return doc;
  };

  const deleteById = async ({ actor, actorId, rotationId }: TDeleteDTO) => {
    const doc = await secretRotationDAL.findById(rotationId);
    if (!doc) throw new BadRequestError({ message: "Rotation not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      doc.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretRotation
    );
    const deletedDoc = await secretRotationDAL.transaction(async (tx) => {
      const strat = await secretRotationDAL.deleteById(rotationId, tx);
      await secretRotationQueue.removeFromQueue(strat.id, strat.interval);
      return strat;
    });
    return { ...doc, ...deletedDoc };
  };

  return {
    getProviderTemplates,
    getById,
    getByProjectId,
    createRotation,
    restartById,
    deleteById
  };
};
