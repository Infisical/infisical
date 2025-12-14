import { ForbiddenError, subject } from "@casl/ability";
import RE2 from "re2";

import { ActionProjectType, SubscriptionProductCategory } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TDynamicSecretDALFactory } from "../dynamic-secret/dynamic-secret-dal";
import { DynamicSecretProviders, TDynamicProviderFns } from "../dynamic-secret/providers/models";
import { TDynamicSecretLeaseDALFactory } from "./dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "./dynamic-secret-lease-queue";
import {
  DynamicSecretLeaseStatus,
  TDynamicSecretLeaseConfig,
  TDynamicSecretLeaseServiceFactory
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
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: TIdentityDALFactory;
};

export const dynamicSecretLeaseServiceFactory = ({
  dynamicSecretLeaseDAL,
  dynamicSecretProviders,
  dynamicSecretDAL,
  folderDAL,
  permissionService,
  dynamicSecretQueueService,
  projectDAL,
  licenseService,
  kmsService,
  userDAL,
  identityDAL
}: TDynamicSecretLeaseServiceFactoryDep): TDynamicSecretLeaseServiceFactory => {
  const extractEmailUsername = (email: string) => {
    const regex = new RE2(/^([^@]+)/);
    const match = email.match(regex);
    return match ? match[1] : email;
  };

  const create: TDynamicSecretLeaseServiceFactory["create"] = async ({
    environmentSlug,
    path,
    name,
    projectSlug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    ttl,
    config
  }) => {
    const appCfg = getConfig();
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.SecretManager, "dynamicSecret")) {
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const totalLeasesTaken = await dynamicSecretLeaseDAL.countLeasesForDynamicSecret(dynamicSecretCfg.id);
    if (totalLeasesTaken >= appCfg.MAX_LEASE_LIMIT)
      throw new BadRequestError({ message: `Max lease limit reached. Limit: ${appCfg.MAX_LEASE_LIMIT}` });

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: Buffer.from(dynamicSecretCfg.encryptedInput) }).toString()
    ) as object;

    const selectedTTL = ttl || dynamicSecretCfg.defaultTTL;
    const { maxTTL } = dynamicSecretCfg;
    const expireAt = new Date(new Date().getTime() + ms(selectedTTL));
    if (maxTTL) {
      const maxExpiryDate = new Date(new Date().getTime() + ms(maxTTL));
      if (expireAt > maxExpiryDate) throw new BadRequestError({ message: "TTL cannot be larger than max TTL" });
    }

    let result;
    try {
      const identity: { name: string } = { name: "" };
      if (actor === ActorType.USER) {
        const user = await userDAL.findById(actorId);
        if (user) {
          identity.name = extractEmailUsername(user.username);
        }
      } else if (actor === ActorType.Machine) {
        const machineIdentity = await identityDAL.findById(actorId);
        if (machineIdentity) {
          identity.name = machineIdentity.name;
        }
      }
      result = await selectedProvider.create({
        inputs: decryptedStoredInput,
        expireAt: expireAt.getTime(),
        usernameTemplate: dynamicSecretCfg.usernameTemplate,
        identity,
        metadata: { projectId },
        config
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && error !== null && "sqlMessage" in error) {
        throw new BadRequestError({ message: error.sqlMessage as string });
      }
      throw error;
    }
    const { entityId, data } = result;

    const dynamicSecretLease = await dynamicSecretLeaseDAL.create({
      expireAt,
      version: 1,
      dynamicSecretId: dynamicSecretCfg.id,
      externalEntityId: entityId,
      config
    });

    await dynamicSecretQueueService.setLeaseRevocation(dynamicSecretLease.id, dynamicSecretCfg.id, expireAt);
    return {
      lease: dynamicSecretLease,
      dynamicSecret: dynamicSecretCfg,
      data,
      projectId,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const renewLease: TDynamicSecretLeaseServiceFactory["renewLease"] = async ({
    ttl,
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    path,
    environmentSlug,
    leaseId
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.SecretManager, "dynamicSecret")) {
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
    if (!dynamicSecretLease || dynamicSecretLease.dynamicSecret.folderId !== folder.id) {
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({
      id: dynamicSecretLease.dynamicSecretId,
      folderId: folder.id
    });

    if (!dynamicSecretCfg)
      throw new NotFoundError({
        message: `Dynamic secret with ID '${dynamicSecretLease.dynamicSecretId}' not found`
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: Buffer.from(dynamicSecretCfg.encryptedInput) }).toString()
    ) as object;

    const selectedTTL = ttl || dynamicSecretCfg.defaultTTL;
    const { maxTTL } = dynamicSecretCfg;
    const expireAt = new Date(dynamicSecretLease.expireAt.getTime() + ms(selectedTTL));
    if (maxTTL) {
      const maxExpiryDate = new Date(dynamicSecretLease.createdAt.getTime() + ms(maxTTL));
      if (expireAt > maxExpiryDate)
        throw new BadRequestError({
          message: "The requested renewal would exceed the maximum allowed lease duration. Please choose a shorter TTL"
        });
    }

    const { entityId } = await selectedProvider.renew(
      decryptedStoredInput,
      dynamicSecretLease.externalEntityId,
      expireAt.getTime(),
      { projectId }
    );

    await dynamicSecretQueueService.unsetLeaseRevocation(dynamicSecretLease.id);
    await dynamicSecretQueueService.setLeaseRevocation(dynamicSecretLease.id, dynamicSecretCfg.id, expireAt);
    const updatedDynamicSecretLease = await dynamicSecretLeaseDAL.updateById(dynamicSecretLease.id, {
      expireAt,
      externalEntityId: entityId
    });
    return {
      lease: updatedDynamicSecretLease,
      dynamicSecret: dynamicSecretCfg,
      projectId,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const revokeLease: TDynamicSecretLeaseServiceFactory["revokeLease"] = async ({
    leaseId,
    environmentSlug,
    path,
    projectSlug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    isForced
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environmentSlug}' not found`
      });

    const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
    if (!dynamicSecretLease || dynamicSecretLease.dynamicSecret.folderId !== folder.id)
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({
      id: dynamicSecretLease.dynamicSecretId,
      folderId: folder.id
    });

    if (!dynamicSecretCfg)
      throw new NotFoundError({
        message: `Dynamic secret with ID '${dynamicSecretLease.dynamicSecretId}' not found`
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: Buffer.from(dynamicSecretCfg.encryptedInput) }).toString()
    ) as object;

    const revokeResponse = await selectedProvider
      .revoke(
        decryptedStoredInput,
        dynamicSecretLease.externalEntityId,
        { projectId },
        dynamicSecretLease.config as TDynamicSecretLeaseConfig
      )
      .catch(async (err) => {
        // only propogate this error if forced is false
        if (!isForced) return { error: err as Error };
      });

    if ((revokeResponse as { error?: Error })?.error) {
      const { error } = revokeResponse as { error?: Error };
      logger.error(error?.message, "Failed to revoke lease");
      const updatedDynamicSecretLease = await dynamicSecretLeaseDAL.updateById(dynamicSecretLease.id, {
        status: DynamicSecretLeaseStatus.FailedDeletion,
        statusDetails: error?.message?.slice(0, 255)
      });
      // queue a job to retry the revocation at a later time
      await dynamicSecretQueueService.queueFailedRevocation(dynamicSecretLease.id, dynamicSecretCfg.id);
      return {
        lease: updatedDynamicSecretLease,
        dynamicSecret: dynamicSecretCfg,
        projectId,
        environment: environmentSlug,
        secretPath: path
      };
    }

    await dynamicSecretQueueService.unsetLeaseRevocation(dynamicSecretLease.id);
    const deletedDynamicSecretLease = await dynamicSecretLeaseDAL.deleteById(dynamicSecretLease.id);
    return {
      lease: deletedDynamicSecretLease,
      dynamicSecret: dynamicSecretCfg,
      projectId,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const listLeases: TDynamicSecretLeaseServiceFactory["listLeases"] = async ({
    path,
    name,
    actor,
    actorId,
    projectSlug,
    actorOrgId,
    environmentSlug,
    actorAuthMethod
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const dynamicSecretLeases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfg.id });
    return {
      leases: dynamicSecretLeases,
      dynamicSecret: dynamicSecretCfg,
      projectId,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const getLeaseDetails: TDynamicSecretLeaseServiceFactory["getLeaseDetails"] = async ({
    projectSlug,
    actorOrgId,
    path,
    environmentSlug,
    actor,
    actorId,
    leaseId,
    actorAuthMethod
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) throw new NotFoundError({ message: `Folder with path '${path}' not found` });

    const dynamicSecretLease = await dynamicSecretLeaseDAL.findById(leaseId);
    if (!dynamicSecretLease)
      throw new NotFoundError({ message: `Dynamic secret lease with ID '${leaseId}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({
      id: dynamicSecretLease.dynamicSecretId,
      folderId: folder.id
    });

    if (!dynamicSecretCfg)
      throw new NotFoundError({
        message: `Dynamic secret with ID '${dynamicSecretLease.dynamicSecretId}' not found`
      });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.Lease,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    return {
      lease: dynamicSecretLease,
      dynamicSecret: dynamicSecretCfg,
      projectId,
      environment: environmentSlug,
      secretPath: path
    };
  };

  return {
    create,
    listLeases,
    revokeLease,
    renewLease,
    getLeaseDetails
  };
};
