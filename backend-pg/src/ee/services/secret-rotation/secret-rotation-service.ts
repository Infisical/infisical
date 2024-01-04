import { ForbiddenError } from "@casl/ability";
import Ajv from "ajv";

import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";
import { TProjectEnvDalFactory } from "@app/services/project-env/project-env-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TSecretRotationDalFactory } from "./secret-rotation-dal";
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
  secretRotationDal: TSecretRotationDalFactory;
  projectEnvDal: Pick<TProjectEnvDalFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretRotationQueue: TSecretRotationQueueFactory;
};

export type TSecretRotationServiceFactory = ReturnType<typeof secretRotationServiceFactory>;

const ajv = new Ajv({ strict: false });
export const secretRotationServiceFactory = ({
  secretRotationDal,
  permissionService,
  projectEnvDal,
  secretRotationQueue
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
    const env = await projectEnvDal.findOne({ slug: environment });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

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
    const secretRotation = secretRotationDal.transaction(async (tx) => {
      const doc = await secretRotationDal.create(
        {
          provider,
          secretPath,
          interval,
          envId: env.id,
          encryptedDataTag: encData.tag,
          encryptedDataIV: encData.iv,
          encryptedData: encData.ciphertext,
          algorithm: encData.algorithm,
          keyEncoding: encData.encoding
        },
        tx
      );
      await secretRotationQueue.addToQueue(doc.id, doc.interval);
      const outputSecretMapping = await secretRotationDal.secretOutputInsertMany(
        Object.entries(outputs).map(([key, secretId]) => ({ key, secretId, rotationId: doc.id })),
        tx
      );
      return { ...doc, outputs: outputSecretMapping, environment: env };
    });
    return secretRotation;
  };

  const getById = async ({ rotationId, actor, actorId }: TGetByIdDTO) => {
    const [doc] = await secretRotationDal.find({ id: rotationId });
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
    const doc = await secretRotationDal.find({ projectId });
    return doc;
  };

  const restartById = async ({ actor, actorId, rotationId }: TRestartDTO) => {
    const doc = await secretRotationDal.findById(rotationId);
    if (!doc) throw new BadRequestError({ message: "Rotation not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      doc.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.SecretRotation
    );
    await secretRotationQueue.removeFromQueue(doc.id);
    await secretRotationQueue.addToQueue(doc.id, doc.interval);
    return doc;
  };

  const deleteById = async ({ actor, actorId, rotationId }: TDeleteDTO) => {
    const doc = await secretRotationDal.findById(rotationId);
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
    const deletedDoc = await secretRotationDal.transaction(async (tx) => {
      const strat = await secretRotationDal.deleteById(rotationId, tx);
      await secretRotationQueue.removeFromQueue(strat.id);
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
