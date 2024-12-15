import { ForbiddenError, subject } from "@casl/ability";
import ms from "ms";

import { ProjectType, SecretKeyEncoding } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "./dynamic-secret-lease-queue";
import {
  DynamicSecretLeaseStatus,
  TCreateDynamicSecretLeaseDTO,
  TDeleteDynamicSecretLeaseDTO,
  TDetailsDynamicSecretLeaseDTO,
  TListDynamicSecretLeasesDTO,
  TRenewDynamicSecretLeaseDTO
} from "./dynamic-secret-lease-types";

type TDynamicSecretLeaseServiceFactoryDep = {
  dynamicSecretLeaseDAL: TDynamicSecretLeaseDALFactory;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findOne">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  dynamicSecretQueueService: TDynamicSecretLeaseQueueServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
};

export type TDynamicSecretLeaseServiceFactory = ReturnType<typeof dynamicSecretLeaseServiceFactory>;

export const dynamicSecretLeaseServiceFactory = ({
  dynamicSecretLeaseDAL,
  dynamicSecretProviders,
  dynamicSecretDAL,
  folderDAL,
  permissionService,
  dynamicSecretQueueService,
  projectDAL,
  licenseService
}: TDynamicSecretLeaseServiceFactoryDep) => {
  const create = async ({
    environmentSlug,
    path,
    name,
    projectSlug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    ttl
  }: TCreateDynamicSecretLeaseDTO) => {
    const appCfg = getConfig();
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.SecretManager);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to create lease due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg)
      throw new NotFoundError({
        message: `Dynamic secret with name '${name}' in folder with path '${path}' not found`
      });

    const totalLeasesTaken = await dynamicSecretLeaseDAL.countLeasesForDynamicSecret(dynamicSecretCfg.id);
    if (totalLeasesTaken >= appCfg.MAX_LEASE_LIMIT)
      throw new BadRequestError({ message: `Max lease limit reached. Limit: ${appCfg.MAX_LEASE_LIMIT}` });

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      infisicalSymmetricDecrypt({
        keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
        ciphertext: dynamicSecretCfg.inputCiphertext,
        tag: dynamicSecretCfg.inputTag,
        iv: dynamicSecretCfg.inputIV
      })
    ) as object;

    const selectedTTL = ttl || dynamicSecretCfg.defaultTTL;
    const { maxTTL } = dynamicSecretCfg;
    const expireAt = new Date(new Date().getTime() + ms(selectedTTL));
    if (maxTTL) {
      const maxExpiryDate = new Date(new Date().getTime() + ms(maxTTL));
      if (expireAt > maxExpiryDate) throw new BadRequestError({ message: "TTL cannot be larger than max TTL" });
    }

    const { entityId, data } = await selectedProvider.create(decryptedStoredInput, expireAt.getTime());
    const dynamicSecretLease = await dynamicSecretLeaseDAL.create({
      expireAt,
      version: 1,
      dynamicSecretId: dynamicSecretCfg.id,
      externalEntityId: entityId
    });
    await dynamicSecretQueueService.setLeaseRevocation(dynamicSecretLease.id, Number(expireAt) - Number(new Date()));
    return { lease: dynamicSecretLease, dynamicSecret: dynamicSecretCfg, data };
  };

  const renewLease = async ({
    ttl,
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    path,
    environmentSlug,
    leaseId
  }: TRenewDynamicSecretLeaseDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.SecretManager);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan?.dynamicSecret) {
      throw new BadRequestError({
        message: "Failed to renew lease due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
    if (!dynamicSecretLease) {
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });
    }

    const dynamicSecretCfg = dynamicSecretLease.dynamicSecret;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      infisicalSymmetricDecrypt({
        keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
        ciphertext: dynamicSecretCfg.inputCiphertext,
        tag: dynamicSecretCfg.inputTag,
        iv: dynamicSecretCfg.inputIV
      })
    ) as object;

    const selectedTTL = ttl || dynamicSecretCfg.defaultTTL;
    const { maxTTL } = dynamicSecretCfg;
    const expireAt = new Date(dynamicSecretLease.expireAt.getTime() + ms(selectedTTL));
    if (maxTTL) {
      const maxExpiryDate = new Date(dynamicSecretLease.createdAt.getTime() + ms(maxTTL));
      if (expireAt > maxExpiryDate) throw new BadRequestError({ message: "TTL cannot be larger than max ttl" });
    }

    const { entityId } = await selectedProvider.renew(
      decryptedStoredInput,
      dynamicSecretLease.externalEntityId,
      expireAt.getTime()
    );

    await dynamicSecretQueueService.unsetLeaseRevocation(dynamicSecretLease.id);
    await dynamicSecretQueueService.setLeaseRevocation(dynamicSecretLease.id, Number(expireAt) - Number(new Date()));
    const updatedDynamicSecretLease = await dynamicSecretLeaseDAL.updateById(dynamicSecretLease.id, {
      expireAt,
      externalEntityId: entityId
    });
    return updatedDynamicSecretLease;
  };

  const revokeLease = async ({
    leaseId,
    environmentSlug,
    path,
    projectSlug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    isForced
  }: TDeleteDynamicSecretLeaseDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.SecretManager);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
    if (!dynamicSecretLease)
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });

    const dynamicSecretCfg = dynamicSecretLease.dynamicSecret;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      infisicalSymmetricDecrypt({
        keyEncoding: dynamicSecretCfg.keyEncoding as SecretKeyEncoding,
        ciphertext: dynamicSecretCfg.inputCiphertext,
        tag: dynamicSecretCfg.inputTag,
        iv: dynamicSecretCfg.inputIV
      })
    ) as object;

    const revokeResponse = await selectedProvider
      .revoke(decryptedStoredInput, dynamicSecretLease.externalEntityId)
      .catch(async (err) => {
        // only propogate this error if forced is false
        if (!isForced) return { error: err as Error };
      });

    if ((revokeResponse as { error?: Error })?.error) {
      const { error } = revokeResponse as { error?: Error };
      logger.error(error?.message, "Failed to revoke lease");
      const deletedDynamicSecretLease = await dynamicSecretLeaseDAL.updateById(dynamicSecretLease.id, {
        status: DynamicSecretLeaseStatus.FailedDeletion,
        statusDetails: error?.message?.slice(0, 255)
      });
      return deletedDynamicSecretLease;
    }

    await dynamicSecretQueueService.unsetLeaseRevocation(dynamicSecretLease.id);
    const deletedDynamicSecretLease = await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);
    return deletedDynamicSecretLease;
  };

  const listLeases = async ({
    path,
    name,
    actor,
    actorId,
    projectSlug,
    actorOrgId,
    environmentSlug,
    actorAuthMethod
  }: TListDynamicSecretLeasesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg)
      throw new NotFoundError({
        message: `Dynamic secret with name '${name}' in folder with path '${path}' not found`
      });

    const dynamicSecretLeases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfg.id });
    return dynamicSecretLeases;
  };

  const getLeaseDetails = async ({
    projectSlug,
    actorOrgId,
    path,
    environmentSlug,
    actor,
    actorId,
    leaseId,
    actorAuthMethod
  }: TDetailsDynamicSecretLeaseDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new NotFoundError({ message: `Folder with path '${path}' not found` });

    const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
    if (!dynamicSecretLease)
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });

    return dynamicSecretLease;
  };

  return {
    create,
    listLeases,
    revokeLease,
    renewLease,
    getLeaseDetails
  };
};
