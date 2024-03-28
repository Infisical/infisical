import { ForbiddenError, subject } from "@casl/ability";

import { SecretKeyEncoding } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretLeaseDALFactory } from "../dynamic-secret-lease/dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TDynamicSecretDALFactory } from "./dynamic-secret-dal";
import {
  DynamicSecretStatus,
  TCreateDynamicSecretDTO,
  TDeleteDynamicSecretDTO,
  TDetailsDynamicSecretDTO,
  TListDynamicSecretsDTO,
  TUpdateDynamicSecretDTO
} from "./dynamic-secret-types";
import { DynamicSecretProviders, TDynamicProviderFns } from "./providers/models";

type TDynamicSecretServiceFactoryDep = {
  dynamicSecretDAL: TDynamicSecretDALFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "find">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  dynamicSecretQueueService: Pick<
    TDynamicSecretLeaseQueueServiceFactory,
    "pruneDynamicSecret" | "unsetLeaseRevocation"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TDynamicSecretServiceFactory = ReturnType<typeof dynamicSecretServiceFactory>;

export const dynamicSecretServiceFactory = ({
  dynamicSecretDAL,
  dynamicSecretLeaseDAL,
  licenseService,
  folderDAL,
  dynamicSecretProviders,
  permissionService,
  dynamicSecretQueueService,
  projectDAL
}: TDynamicSecretServiceFactoryDep) => {
  const create = async ({
    path,
    actor,
    name,
    actorId,
    maxTTL,
    provider,
    environmentSlug,
    projectSlug,
    actorOrgId,
    defaultTTL,
    actorAuthMethod
  }: TCreateDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to create dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const existingDynamicSecret = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (existingDynamicSecret)
      throw new BadRequestError({ message: "Provided dynamic secret already exist under the folder" });

    const selectedProvider = dynamicSecretProviders[provider.type];
    const inputs = await selectedProvider.validateProviderInputs(provider.inputs);

    const isConnected = await selectedProvider.validateConnection(provider.inputs);
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const encryptedInput = infisicalSymmetricEncypt(JSON.stringify(inputs));
    const dynamicSecretCfg = await dynamicSecretDAL.create({
      type: provider.type,
      version: 1,
      inputIV: encryptedInput.iv,
      inputTag: encryptedInput.tag,
      inputCiphertext: encryptedInput.ciphertext,
      algorithm: encryptedInput.algorithm,
      keyEncoding: encryptedInput.encoding,
      maxTTL,
      defaultTTL,
      folderId: folder.id,
      name
    });
    return dynamicSecretCfg;
  };

  const updateByName = async ({
    name,
    maxTTL,
    defaultTTL,
    inputs,
    environmentSlug,
    projectSlug,
    path,
    actor,
    actorId,
    newName,
    actorOrgId,
    actorAuthMethod
  }: TUpdateDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to update dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) throw new BadRequestError({ message: "Dynamic secret not found" });

    if (newName) {
      const existingDynamicSecret = await dynamicSecretDAL.findOne({ name: newName, folderId: folder.id });
      if (existingDynamicSecret)
        throw new BadRequestError({ message: "Provided dynamic secret already exist under the folder" });
    }

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      infisicalSymmetricDecrypt({
        keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
        ciphertext: dynamicSecretCfg.inputCiphertext,
        tag: dynamicSecretCfg.inputTag,
        iv: dynamicSecretCfg.inputIV
      })
    ) as object;
    const newInput = { ...decryptedStoredInput, ...(inputs || {}) };
    const updatedInput = await selectedProvider.validateProviderInputs(newInput);

    const isConnected = await selectedProvider.validateConnection(newInput);
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const encryptedInput = infisicalSymmetricEncypt(JSON.stringify(updatedInput));
    const updatedDynamicCfg = await dynamicSecretDAL.updateById(dynamicSecretCfg.id, {
      inputIV: encryptedInput.iv,
      inputTag: encryptedInput.tag,
      inputCiphertext: encryptedInput.ciphertext,
      algorithm: encryptedInput.algorithm,
      keyEncoding: encryptedInput.encoding,
      maxTTL,
      defaultTTL,
      name: newName ?? name,
      status: null,
      statusDetails: null
    });

    return updatedDynamicCfg;
  };

  const deleteByName = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    name,
    path,
    environmentSlug,
    isForced
  }: TDeleteDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) throw new BadRequestError({ message: "Dynamic secret not found" });

    const leases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfg.id });
    // when not forced we check with the external system to first remove the things
    // we introduce a forced concept because consider the external lease got deleted by some other external like a human or another system
    // this allows user to clean up it from infisical
    if (isForced) {
      // clear all queues for lease revocations
      await Promise.all(leases.map(({ id: leaseId }) => dynamicSecretQueueService.unsetLeaseRevocation(leaseId)));

      const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
      return deletedDynamicSecretCfg;
    }
    // if leases exist we should flag it as deleting and then remove leases in background
    // then delete the main one
    if (leases.length) {
      const updatedDynamicSecretCfg = await dynamicSecretDAL.updateById(dynamicSecretCfg.id, {
        status: DynamicSecretStatus.Deleting
      });
      await dynamicSecretQueueService.pruneDynamicSecret(updatedDynamicSecretCfg.id);
      return updatedDynamicSecretCfg;
    }
    // if no leases just delete the config
    const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
    return deletedDynamicSecretCfg;
  };

  const getDetails = async ({
    name,
    projectSlug,
    path,
    environmentSlug,
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor
  }: TDetailsDynamicSecretDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) throw new BadRequestError({ message: "Dynamic secret not found" });
    const decryptedStoredInput = JSON.parse(
      infisicalSymmetricDecrypt({
        keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
        ciphertext: dynamicSecretCfg.inputCiphertext,
        tag: dynamicSecretCfg.inputTag,
        iv: dynamicSecretCfg.inputIV
      })
    ) as object;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const providerInputs = (await selectedProvider.validateProviderInputs(decryptedStoredInput)) as object;
    return { ...dynamicSecretCfg, inputs: providerInputs };
  };

  const list = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    path,
    environmentSlug
  }: TListDynamicSecretsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.find({ folderId: folder.id });
    return dynamicSecretCfg;
  };

  return {
    create,
    updateByName,
    deleteByName,
    getDetails,
    list
  };
};
