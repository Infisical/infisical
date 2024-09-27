import { ForbiddenError, subject } from "@casl/ability";

import { SecretKeyEncoding } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { OrderByDirection } from "@app/lib/types";
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
  TGetDynamicSecretsCountDTO,
  TListDynamicSecretsDTO,
  TListDynamicSecretsMultiEnvDTO,
  TUpdateDynamicSecretDTO
} from "./dynamic-secret-types";
import { AzureEntraIDProvider } from "./providers/azure-entra-id";
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
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findBySecretPathMultiEnv">;
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

  // get unique dynamic secret count across multiple envs
  const getCountMultiEnv = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectId,
    path,
    environmentSlugs,
    search,
    isInternal
  }: TListDynamicSecretsMultiEnvDTO) => {
    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission(
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId
      );

      // verify user has access to each env in request
      environmentSlugs.forEach((environmentSlug) =>
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
        )
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length) throw new BadRequestError({ message: "Folders not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { $in: { folderId: folders.map((folder) => folder.id) }, $search: search ? { name: `%${search}%` } : undefined },
      { countDistinct: "name" }
    );

    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  // get dynamic secret count for a single env
  const getDynamicSecretCount = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlug,
    search,
    projectId
  }: TGetDynamicSecretsCountDTO) => {
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

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      { count: true }
    );
    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  const listDynamicSecretsByEnv = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    path,
    environmentSlug,
    limit,
    offset,
    orderBy,
    orderDirection = OrderByDirection.ASC,
    search,
    ...params
  }: TListDynamicSecretsDTO) => {
    let { projectId } = params;

    if (!projectId) {
      if (!projectSlug) throw new BadRequestError({ message: "Project ID or slug required" });
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new BadRequestError({ message: "Project not found" });
      projectId = project.id;
    }

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

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      {
        limit,
        offset,
        sort: orderBy ? [[orderBy, orderDirection]] : undefined
      }
    );
    return dynamicSecretCfg;
  };

  // get dynamic secrets for multiple envs
  const listDynamicSecretsByFolderIds = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlugs,
    projectId,
    isInternal,
    ...params
  }: TListDynamicSecretsMultiEnvDTO) => {
    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission(
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId
      );

      // verify user has access to each env in request
      environmentSlugs.forEach((environmentSlug) =>
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, { environment: environmentSlug, secretPath: path })
        )
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length) throw new BadRequestError({ message: "Folders not found" });

    const dynamicSecretCfg = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: folders.map((folder) => folder.id),
      ...params
    });

    return dynamicSecretCfg;
  };

  const fetchAzureEntraIdUsers = async ({
    tenantId,
    applicationId,
    clientSecret
  }: {
    tenantId: string;
    applicationId: string;
    clientSecret: string;
  }) => {
    const azureEntraIdUsers = await AzureEntraIDProvider().fetchAzureEntraIdUsers(
      tenantId,
      applicationId,
      clientSecret
    );
    return azureEntraIdUsers;
  };

  return {
    create,
    updateByName,
    deleteByName,
    getDetails,
    listDynamicSecretsByEnv,
    listDynamicSecretsByFolderIds,
    getDynamicSecretCount,
    getCountMultiEnv,
    fetchAzureEntraIdUsers
  };
};
