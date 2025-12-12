import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, SubscriptionProductCategory } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { extractObjectFieldPaths } from "@app/lib/fn";
import { OrderByDirection } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretLeaseDALFactory } from "../dynamic-secret-lease/dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TGatewayDALFactory } from "../gateway/gateway-dal";
import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TDynamicSecretDALFactory } from "./dynamic-secret-dal";
import { DynamicSecretStatus, TDynamicSecretServiceFactory } from "./dynamic-secret-types";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayDAL: Pick<TGatewayDALFactory, "findOne" | "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne" | "find">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
};

const getUpdatedFieldPaths = (
  oldData: Record<string, unknown> | null | undefined,
  newData: Record<string, unknown> | null | undefined
): string[] => {
  const updatedPaths = new Set<string>();

  if (!newData || typeof newData !== "object") {
    return [];
  }

  if (!oldData || typeof oldData !== "object") {
    return [];
  }

  Object.keys(newData).forEach((key) => {
    const oldValue = oldData?.[key];
    const newValue = newData[key];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      // Extract paths from the new value
      const paths = extractObjectFieldPaths(newValue, key);
      paths.forEach((path) => updatedPaths.add(path));
    }
  });

  return Array.from(updatedPaths).sort();
};

export const dynamicSecretServiceFactory = ({
  dynamicSecretDAL,
  dynamicSecretLeaseDAL,
  licenseService,
  folderDAL,
  dynamicSecretProviders,
  permissionService,
  dynamicSecretQueueService,
  projectDAL,
  kmsService,
  gatewayDAL,
  gatewayV2DAL,
  resourceMetadataDAL
}: TDynamicSecretServiceFactoryDep): TDynamicSecretServiceFactory => {
  const create: TDynamicSecretServiceFactory["create"] = async ({
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
    actorAuthMethod,
    metadata,
    usernameTemplate
  }) => {
    let isGatewayV1 = true;
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path, metadata })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.SecretsManager, "dynamicSecret")) {
      throw new BadRequestError({
        message: "Failed to create dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    if (provider.type === DynamicSecretProviders.MongoAtlas && crypto.isFipsModeEnabled()) {
      throw new BadRequestError({
        message: "MongoDB Atlas dynamic secret is not supported in FIPS mode of operation"
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });
    }

    const existingDynamicSecret = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (existingDynamicSecret)
      throw new BadRequestError({ message: "Provided dynamic secret already exists under the folder" });

    const selectedProvider = dynamicSecretProviders[provider.type];
    const inputs = await selectedProvider.validateProviderInputs(provider.inputs, { projectId });

    let selectedGatewayId: string | null = null;
    if (inputs && typeof inputs === "object" && "gatewayId" in inputs && inputs.gatewayId) {
      const gatewayId = inputs.gatewayId as string;

      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actorOrgId });
      const [gatewayv2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actorOrgId });

      if (!gateway && !gatewayv2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: gateway?.orgId || gatewayv2?.orgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      selectedGatewayId = gateway?.id ?? gatewayv2?.id;
    }

    const isConnected = await selectedProvider.validateConnection(provider.inputs, { projectId });
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const dynamicSecretCfg = await dynamicSecretDAL.transaction(async (tx) => {
      const cfg = await dynamicSecretDAL.create(
        {
          type: provider.type,
          version: 1,
          encryptedInput: secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(inputs)) }).cipherTextBlob,
          maxTTL,
          defaultTTL,
          folderId: folder.id,
          name,
          gatewayId: isGatewayV1 ? selectedGatewayId : undefined,
          gatewayV2Id: isGatewayV1 ? undefined : selectedGatewayId,
          usernameTemplate
        },
        tx
      );

      if (metadata) {
        await resourceMetadataDAL.insertMany(
          metadata.map(({ key, value }) => ({
            key,
            value,
            dynamicSecretId: cfg.id,
            orgId: actorOrgId
          })),
          tx
        );
      }

      return cfg;
    });

    return {
      ...dynamicSecretCfg,
      inputs,
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const updateByName: TDynamicSecretServiceFactory["updateByName"] = async ({
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
    actorAuthMethod,
    metadata,
    usernameTemplate
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

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.get(SubscriptionProductCategory.SecretsManager, "dynamicSecret")) {
      throw new BadRequestError({
        message: "Failed to update dynamic secret due to plan restriction. Upgrade plan to create dynamic secret."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({
        message: `Dynamic secret with name '${name}' in folder '${folder.path}' not found`
      });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    if (metadata) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionDynamicSecretActions.EditRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment: environmentSlug,
          secretPath: path,
          metadata
        })
      );
    }

    if (newName) {
      const existingDynamicSecret = await dynamicSecretDAL.findOne({ name: newName, folderId: folder.id });
      if (existingDynamicSecret)
        throw new BadRequestError({ message: "Provided dynamic secret already exists under the folder" });
    }
    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const newInput = { ...decryptedStoredInput, ...(inputs || {}) };
    const oldInput = await selectedProvider.validateProviderInputs(decryptedStoredInput, { projectId });
    const updatedInput = await selectedProvider.validateProviderInputs(newInput, { projectId });

    const updatedFields = getUpdatedFieldPaths(
      {
        ...(oldInput as object),
        maxTTL: dynamicSecretCfg.maxTTL,
        defaultTTL: dynamicSecretCfg.defaultTTL,
        name: dynamicSecretCfg.name,
        usernameTemplate
      },
      {
        ...(updatedInput as object),
        maxTTL,
        defaultTTL,
        name: newName ?? name,
        usernameTemplate
      }
    );

    let selectedGatewayId: string | null = null;
    let isGatewayV1 = true;
    if (updatedInput && typeof updatedInput === "object" && "gatewayId" in updatedInput && updatedInput?.gatewayId) {
      const gatewayId = updatedInput.gatewayId as string;

      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actorOrgId });
      const [gatewayv2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actorOrgId });

      if (!gateway && !gatewayv2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: gateway?.orgId || gatewayv2?.orgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      selectedGatewayId = gateway?.id ?? gatewayv2?.id;
    }

    const isConnected = await selectedProvider.validateConnection(newInput, { projectId });
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const updatedDynamicCfg = await dynamicSecretDAL.transaction(async (tx) => {
      const cfg = await dynamicSecretDAL.updateById(
        dynamicSecretCfg.id,
        {
          encryptedInput: secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(updatedInput)) })
            .cipherTextBlob,
          maxTTL,
          defaultTTL,
          name: newName ?? name,
          status: null,
          gatewayId: isGatewayV1 ? selectedGatewayId : null,
          gatewayV2Id: isGatewayV1 ? null : selectedGatewayId,
          usernameTemplate
        },
        tx
      );

      if (metadata) {
        await resourceMetadataDAL.delete(
          {
            dynamicSecretId: cfg.id
          },
          tx
        );

        await resourceMetadataDAL.insertMany(
          metadata.map(({ key, value }) => ({
            key,
            value,
            dynamicSecretId: cfg.id,
            orgId: actorOrgId
          })),
          tx
        );
      }

      return cfg;
    });

    return {
      dynamicSecret: updatedDynamicCfg,
      updatedFields,
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const deleteByName: TDynamicSecretServiceFactory["deleteByName"] = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectSlug,
    name,
    path,
    environmentSlug,
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

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name}' in folder '${folder.path}' not found` });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const leases = await dynamicSecretLeaseDAL.find({ dynamicSecretId: dynamicSecretCfg.id });
    // when not forced we check with the external system to first remove the things
    // we introduce a forced concept because consider the external lease got deleted by some other external like a human or another system
    // this allows user to clean up it from infisical
    if (isForced) {
      // clear all queues for lease revocations
      await Promise.all(leases.map(({ id: leaseId }) => dynamicSecretQueueService.unsetLeaseRevocation(leaseId)));

      const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
      return {
        ...deletedDynamicSecretCfg,
        environment: environmentSlug,
        secretPath: path,
        projectId: project.id
      };
    }
    // if leases exist we should flag it as deleting and then remove leases in background
    // then delete the main one
    if (leases.length) {
      const updatedDynamicSecretCfg = await dynamicSecretDAL.updateById(dynamicSecretCfg.id, {
        status: DynamicSecretStatus.Deleting
      });
      await dynamicSecretQueueService.pruneDynamicSecret(updatedDynamicSecretCfg.id);
      return {
        ...updatedDynamicSecretCfg,
        environment: environmentSlug,
        secretPath: path,
        projectId: project.id
      };
    }
    // if no leases just delete the config
    const deletedDynamicSecretCfg = await dynamicSecretDAL.deleteById(dynamicSecretCfg.id);
    return {
      ...deletedDynamicSecretCfg,
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const getDetails: TDynamicSecretServiceFactory["getDetails"] = async ({
    name,
    projectSlug,
    path,
    environmentSlug,
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor
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
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name} in folder '${path}' not found` });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject(ProjectPermissionSub.DynamicSecrets, {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      })
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const providerInputs = (await selectedProvider.validateProviderInputs(decryptedStoredInput, {
      projectId
    })) as object;

    return {
      ...dynamicSecretCfg,
      inputs: providerInputs,
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  // get unique dynamic secret count across multiple envs
  const getCountMultiEnv: TDynamicSecretServiceFactory["getCountMultiEnv"] = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    projectId,
    path,
    environmentSlugs,
    search,
    isInternal
  }) => {
    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.SecretManager
      });

      // verify user has access to each env in request
      environmentSlugs.forEach((environmentSlug) =>
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject(ProjectPermissionSub.DynamicSecrets, { environment: environmentSlug, secretPath: path })
        )
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length) {
      throw new NotFoundError({
        message: `Folders with path '${path}' in environments with slugs '${environmentSlugs.join(", ")}' not found`
      });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { $in: { folderId: folders.map((folder) => folder.id) }, $search: search ? { name: `%${search}%` } : undefined },
      { countDistinct: "name" }
    );

    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  // get dynamic secret count for a single env
  const getDynamicSecretCount: TDynamicSecretServiceFactory["getDynamicSecretCount"] = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlug,
    search,
    projectId
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionSub.DynamicSecrets
    );

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      { count: true }
    );
    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  const listDynamicSecretsByEnv: TDynamicSecretServiceFactory["listDynamicSecretsByEnv"] = async ({
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
  }) => {
    let { projectId } = params;

    if (!projectId) {
      if (!projectSlug) throw new BadRequestError({ message: "Project ID or slug required" });
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      projectId = project.id;
    }

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
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findWithMetadata(
      { folderId: folder.id, $search: search ? { name: `%${search}%` } : undefined },
      {
        limit,
        offset,
        sort: orderBy ? [[orderBy, orderDirection]] : undefined
      }
    );

    return {
      dynamicSecrets: dynamicSecretCfg.filter((dynamicSecret) => {
        return permission.can(
          ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject(ProjectPermissionSub.DynamicSecrets, {
            environment: environmentSlug,
            secretPath: path,
            metadata: dynamicSecret.metadata
          })
        );
      }),
      environment: environmentSlug,
      secretPath: path,
      projectId
    };
  };

  const listDynamicSecretsByFolderIds: TDynamicSecretServiceFactory["listDynamicSecretsByFolderIds"] = async (
    { folderMappings, filters, projectId },
    actor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const userAccessibleFolderMappings = folderMappings.filter(({ path, environment }) =>
      permission.can(
        ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, { environment, secretPath: path })
      )
    );

    const groupedFolderMappings = new Map(userAccessibleFolderMappings.map((path) => [path.folderId, path]));

    const dynamicSecrets = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: userAccessibleFolderMappings.map(({ folderId }) => folderId),
      ...filters
    });

    return dynamicSecrets.map((dynamicSecret) => {
      const { environment, path } = groupedFolderMappings.get(dynamicSecret.folderId)!;
      return {
        ...dynamicSecret,
        environment,
        path
      };
    });
  };

  // get dynamic secrets for multiple envs
  const listDynamicSecretsByEnvs: TDynamicSecretServiceFactory["listDynamicSecretsByEnvs"] = async ({
    actorAuthMethod,
    actorOrgId,
    actorId,
    actor,
    path,
    environmentSlugs,
    projectId,
    isInternal,
    ...params
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length)
      throw new NotFoundError({
        message: `Folders with path '${path} in environments with slugs '${environmentSlugs.join(", ")}' not found`
      });

    const dynamicSecretCfg = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: folders.map((folder) => folder.id),
      ...params
    });

    return dynamicSecretCfg.filter((dynamicSecret) => {
      return permission.can(
        ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment: dynamicSecret.environment,
          secretPath: path,
          metadata: dynamicSecret.metadata
        })
      );
    });
  };

  const fetchAzureEntraIdUsers: TDynamicSecretServiceFactory["fetchAzureEntraIdUsers"] = async ({
    tenantId,
    applicationId,
    clientSecret
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
    listDynamicSecretsByEnvs,
    getDynamicSecretCount,
    getCountMultiEnv,
    fetchAzureEntraIdUsers,
    listDynamicSecretsByFolderIds
  };
};
