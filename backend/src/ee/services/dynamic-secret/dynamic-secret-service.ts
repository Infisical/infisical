import { KmsDataKey, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionGatewayActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { ProjectPermissionDynamicSecretActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { assertIndividualGatewayAllowed } from "@app/ee/services/gateway-pool/gateway-pool-policy-fns";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { extractObjectFieldPaths, takeDistinctKeyScanWindow } from "@app/lib/fn";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { OrderByDirection, toOrgServiceActor } from "@app/lib/types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TDynamicSecretLeaseDALFactory } from "../dynamic-secret-lease/dynamic-secret-lease-dal";
import { TDynamicSecretLeaseQueueServiceFactory } from "../dynamic-secret-lease/dynamic-secret-lease-queue";
import { TGatewayPoolServiceFactory } from "../gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TDynamicSecretDALFactory } from "./dynamic-secret-dal";
import { DynamicSecretStatus, TDynamicSecretServiceFactory } from "./dynamic-secret-types";
import { AzureEntraIDProvider } from "./providers/azure-entra-id";
import { GcpIamServiceAccountSuffixError } from "./providers/gcp-iam";
import { IbmApiConnectProvider } from "./providers/ibm-api-connect";
import { DynamicSecretProviders, SshStoredSchema, TDynamicProviderFns } from "./providers/models";
import { redactStoredInputs, restoreOmittedSecretFields } from "./providers/redact";

type TDynamicSecretServiceFactoryDep = {
  dynamicSecretDAL: TDynamicSecretDALFactory;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "find" | "countLeasesForDynamicSecret">;
  dynamicSecretProviders: Record<DynamicSecretProviders, TDynamicProviderFns>;
  dynamicSecretQueueService: Pick<
    TDynamicSecretLeaseQueueServiceFactory,
    "pruneDynamicSecret" | "unsetLeaseRevocation"
  >;
  licenseDomain: TLicenseDomain;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "findBySecretPathMultiEnv" | "findById" | "findSecretPathByFolderIds"
  >;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  secretsDomain: Pick<TSecretsDomain, "getSecretsPermission">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  kmsCoreDomain: TKmsCoreDomain;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne" | "find">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
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
  licenseDomain,
  folderDAL,
  dynamicSecretProviders,
  secretsDomain,
  organizationsDomain,
  dynamicSecretQueueService,
  projectDAL,
  kmsCoreDomain,
  gatewayV2DAL,
  gatewayPoolService,
  orgDAL,
  resourceMetadataDAL
}: TDynamicSecretServiceFactoryDep): TDynamicSecretServiceFactory => {
  const create: TDynamicSecretServiceFactory["create"] = async ({
    path,
    actor,
    name,
    maxTTL,
    provider,
    environmentSlug,
    projectSlug,
    defaultTTL,
    metadata,
    usernameTemplate
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.CreateRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: { environment: environmentSlug, secretPath: path, metadata }
    });

    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan?.dynamicSecret) {
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
    const inputs = await selectedProvider.validateProviderInputs(provider.inputs, {
      projectId,
      defaultTTL,
      maxTTL
    });

    if (
      inputs &&
      typeof inputs === "object" &&
      "gatewayId" in inputs &&
      inputs.gatewayId &&
      "gatewayPoolId" in inputs &&
      inputs.gatewayPoolId
    ) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }

    let selectedGatewayId: string | null = null;
    let selectedGatewayPoolId: string | null = null;
    if (inputs && typeof inputs === "object" && "gatewayPoolId" in inputs && inputs.gatewayPoolId) {
      const gatewayPoolId = inputs.gatewayPoolId as string;
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actor.org.id,
        actor: toOrgServiceActor(actor)
      });
      selectedGatewayPoolId = gatewayPoolId;
    } else if (inputs && typeof inputs === "object" && "gatewayId" in inputs && inputs.gatewayId) {
      const gatewayId = inputs.gatewayId as string;

      const [gatewayv2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actor.org.id });

      if (!gatewayv2) {
        throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
      }

      const orgPermission = await organizationsDomain.getOrgPermission({ actor, orgId: gatewayv2.orgId });

      orgPermission.assert({
        action: OrgPermissionGatewayActions.AttachGateways,
        subject: OrgPermissionSubjects.Gateway
      });

      await assertIndividualGatewayAllowed({ orgDAL, orgId: actor.org.id, gatewayId: gatewayv2.id });

      selectedGatewayId = gatewayv2.id;
    }

    const isConnected = await selectedProvider.validateConnection(provider.inputs, { projectId, defaultTTL, maxTTL });
    if (!isConnected) throw new BadRequestError({ message: "Provider connection failed" });

    const { encryptor: secretManagerEncryptor } = await kmsCoreDomain.createCipherPairWithDataKey({
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
          gatewayV2Id: !selectedGatewayPoolId ? selectedGatewayId : undefined,
          gatewayPoolId: selectedGatewayPoolId ?? undefined,
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
            orgId: actor.org.id
          })),
          tx
        );
      }

      return cfg;
    });

    return {
      ...dynamicSecretCfg,
      inputs: redactStoredInputs(provider.type, inputs),
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
    newName,
    metadata,
    usernameTemplate
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan?.dynamicSecret) {
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

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      }
    });

    if (metadata) {
      permission.assert({
        action: ProjectPermissionDynamicSecretActions.EditRootCredential,
        subject: ProjectPermissionSub.DynamicSecrets,
        fields: {
          environment: environmentSlug,
          secretPath: path,
          metadata
        }
      });
    }

    if (newName) {
      const existingDynamicSecret = await dynamicSecretDAL.findOne({ name: newName, folderId: folder.id });
      if (existingDynamicSecret)
        throw new BadRequestError({ message: "Provided dynamic secret already exists under the folder" });
    }
    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsCoreDomain.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const newInput = restoreOmittedSecretFields(dynamicSecretCfg.type as DynamicSecretProviders, decryptedStoredInput, {
      ...decryptedStoredInput,
      ...(inputs || {})
    });
    // Mutual exclusion: reject if both gateway fields are set
    if (
      inputs &&
      typeof inputs === "object" &&
      "gatewayId" in inputs &&
      inputs.gatewayId &&
      "gatewayPoolId" in inputs &&
      inputs.gatewayPoolId
    ) {
      throw new BadRequestError({ message: "Cannot specify both a gateway and a gateway pool" });
    }
    if (inputs && typeof inputs === "object") {
      if ((inputs as Record<string, unknown>).gatewayId)
        (newInput as Record<string, unknown>).gatewayPoolId = undefined;
      else if ((inputs as Record<string, unknown>).gatewayPoolId)
        (newInput as Record<string, unknown>).gatewayId = undefined;
    }
    let oldInput: unknown;
    try {
      oldInput = await selectedProvider.validateProviderInputs(decryptedStoredInput, { projectId });
    } catch (error) {
      if (error instanceof GcpIamServiceAccountSuffixError) {
        oldInput = decryptedStoredInput;
      } else {
        throw error;
      }
    }
    const activeLeaseCount = await dynamicSecretLeaseDAL.countLeasesForDynamicSecret(dynamicSecretCfg.id);
    const updatedInput = await selectedProvider.validateProviderInputs(newInput, {
      projectId,
      previousInputs: decryptedStoredInput,
      defaultTTL,
      maxTTL,
      hasActiveLeases: activeLeaseCount > 0
    });

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

    let selectedGatewayId: string | null = (newInput as Record<string, unknown>).gatewayId as string | null;
    let selectedGatewayPoolId: string | null = (newInput as Record<string, unknown>).gatewayPoolId as string | null;
    const hasGatewayFieldInInput =
      inputs && typeof inputs === "object" && ("gatewayId" in inputs || "gatewayPoolId" in inputs);
    if (
      inputs &&
      typeof inputs === "object" &&
      "gatewayPoolId" in inputs &&
      inputs.gatewayPoolId &&
      inputs.gatewayPoolId !== (decryptedStoredInput as Record<string, unknown>).gatewayPoolId
    ) {
      const { gatewayPoolId } = inputs;
      await gatewayPoolService.resolveAttachableGatewayFromPool({
        poolId: gatewayPoolId,
        orgId: actor.org.id,
        actor: toOrgServiceActor(actor)
      });
      selectedGatewayPoolId = gatewayPoolId;
    } else if (
      updatedInput &&
      typeof updatedInput === "object" &&
      "gatewayId" in updatedInput &&
      updatedInput?.gatewayId
    ) {
      selectedGatewayPoolId = null;
      const gatewayId = updatedInput.gatewayId as string;

      const [gatewayv2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actor.org.id });

      if (!gatewayv2) {
        throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
      }

      const orgPermission = await organizationsDomain.getOrgPermission({ actor, orgId: gatewayv2.orgId });

      orgPermission.assert({
        action: OrgPermissionGatewayActions.AttachGateways,
        subject: OrgPermissionSubjects.Gateway
      });

      await assertIndividualGatewayAllowed({
        orgDAL,
        orgId: actor.org.id,
        gatewayId: gatewayv2.id,
        previousGatewayId: dynamicSecretCfg.gatewayV2Id
      });

      selectedGatewayId = gatewayv2.id;
    }

    const isConnected = await selectedProvider.validateConnection(newInput, {
      projectId,
      defaultTTL: defaultTTL ?? dynamicSecretCfg.defaultTTL,
      maxTTL: maxTTL === undefined ? dynamicSecretCfg.maxTTL : maxTTL
    });
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
          ...(hasGatewayFieldInInput
            ? {
                // clears the retired v1 pin alongside, so a repointed secret never carries both
                // columns; rows nobody edits keep their v1 value and stay revertible
                gatewayId: null,
                gatewayV2Id: !selectedGatewayPoolId ? selectedGatewayId : null,
                gatewayPoolId: selectedGatewayPoolId
              }
            : {}),
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
            orgId: actor.org.id
          })),
          tx
        );
      }

      return cfg;
    });

    const canReadRootCredential = permission.can({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path,
        metadata: metadata ?? dynamicSecretCfg.metadata
      }
    });

    return {
      dynamicSecret: {
        ...updatedDynamicCfg,
        inputs: canReadRootCredential
          ? redactStoredInputs(dynamicSecretCfg.type as DynamicSecretProviders, updatedInput)
          : null
      },
      updatedFields,
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  const deleteByName: TDynamicSecretServiceFactory["deleteByName"] = async ({
    actor,
    projectSlug,
    name,
    path,
    environmentSlug,
    isForced
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name}' in folder '${folder.path}' not found` });
    }

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      }
    });

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
    actor
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const projectId = project.id;
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ name, folderId: folder.id });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with name '${name} in folder '${path}' not found` });
    }

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      }
    });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path,
        metadata: dynamicSecretCfg.metadata
      }
    });

    const { decryptor: secretManagerDecryptor } = await kmsCoreDomain.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedStoredInput = JSON.parse(
      secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString()
    ) as object;
    const selectedProvider = dynamicSecretProviders[dynamicSecretCfg.type as DynamicSecretProviders];
    let providerInputs: object;
    try {
      providerInputs = (await selectedProvider.validateProviderInputs(decryptedStoredInput, {
        projectId
      })) as object;
    } catch (error) {
      if (error instanceof GcpIamServiceAccountSuffixError) {
        providerInputs = decryptedStoredInput;
      } else {
        throw error;
      }
    }

    return {
      ...dynamicSecretCfg,
      inputs: redactStoredInputs(dynamicSecretCfg.type as DynamicSecretProviders, providerInputs),
      projectId: project.id,
      environment: environmentSlug,
      secretPath: path
    };
  };

  // get unique dynamic secret count across multiple envs
  const getCountMultiEnv: TDynamicSecretServiceFactory["getCountMultiEnv"] = async ({
    actor,
    projectId,
    path,
    environmentSlugs,
    search,
    isInternal
  }) => {
    if (!isInternal) {
      const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

      // verify user has access to each env in request
      environmentSlugs.forEach((environmentSlug) =>
        permission.assert({
          action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject: ProjectPermissionSub.DynamicSecrets,
          fields: { environment: environmentSlug, secretPath: path }
        })
      );
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environmentSlugs, path);
    if (!folders.length) {
      throw new NotFoundError({
        message: `Folders with path '${path}' in environments with slugs '${environmentSlugs.join(", ")}' not found`
      });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { $in: { folderId: folders.map((folder) => folder.id) }, $search: search ? { name: search } : undefined },
      { countDistinct: "name" }
    );

    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  // get dynamic secret count for a single env
  const getDynamicSecretCount: TDynamicSecretServiceFactory["getDynamicSecretCount"] = async ({
    actor,
    path,
    environmentSlug,
    search,
    projectId
  }) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: { environment: environmentSlug, secretPath: path }
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });
    }

    const dynamicSecretCfg = await dynamicSecretDAL.find(
      { folderId: folder.id, $search: search ? { name: search } : undefined },
      { count: true }
    );
    return Number(dynamicSecretCfg[0]?.count ?? 0);
  };

  const listDynamicSecretsByEnv: TDynamicSecretServiceFactory["listDynamicSecretsByEnv"] = async ({
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
      const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      projectId = project.id;
    }

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });
    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: environmentSlug,
        secretPath: path
      }
    });

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, path);
    if (!folder)
      throw new NotFoundError({ message: `Folder with path '${path}' in environment '${environmentSlug}' not found` });

    const dynamicSecretCfg = await dynamicSecretDAL.findWithMetadata(
      { folderId: folder.id, $search: search ? { name: search } : undefined },
      {
        limit,
        offset,
        sort: orderBy ? [[orderBy, orderDirection]] : undefined
      }
    );

    return {
      dynamicSecrets: dynamicSecretCfg.filter((dynamicSecret) => {
        return permission.can({
          action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
          subject: ProjectPermissionSub.DynamicSecrets,
          fields: {
            environment: environmentSlug,
            secretPath: path,
            metadata: dynamicSecret.metadata
          }
        });
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
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

    const userAccessibleFolderMappings = folderMappings.filter(({ path, environment }) =>
      permission.can({
        action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject: ProjectPermissionSub.DynamicSecrets,
        fields: { environment, secretPath: path }
      })
    );

    const groupedFolderMappings = new Map(userAccessibleFolderMappings.map((path) => [path.folderId, path]));

    const { limit } = filters;

    // the DAL windows on distinct names, so scan one name past the limit to tell a full window from a truncated one
    const scannedDynamicSecrets = await dynamicSecretDAL.listDynamicSecretsByFolderIds({
      folderIds: userAccessibleFolderMappings.map(({ folderId }) => folderId),
      ...filters,
      limit: limit ? limit + 1 : undefined
    });

    const { items: windowedDynamicSecrets, isLimitReached } = takeDistinctKeyScanWindow(
      scannedDynamicSecrets,
      limit,
      (dynamicSecret) => dynamicSecret.name
    );

    return {
      dynamicSecrets: windowedDynamicSecrets.map((dynamicSecret) => {
        const { environment, path } = groupedFolderMappings.get(dynamicSecret.folderId)!;
        return {
          ...dynamicSecret,
          environment,
          path
        };
      }),
      isLimitReached
    };
  };

  // get dynamic secrets for multiple envs
  const listDynamicSecretsByEnvs: TDynamicSecretServiceFactory["listDynamicSecretsByEnvs"] = async ({
    actor,
    path,
    environmentSlugs,
    projectId,
    isInternal,
    ...params
  }) => {
    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId });

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
      return permission.can({
        action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
        subject: ProjectPermissionSub.DynamicSecrets,
        fields: {
          environment: dynamicSecret.environment,
          secretPath: path,
          metadata: dynamicSecret.metadata
        }
      });
    });
  };

  const getSshCaPublicKey: TDynamicSecretServiceFactory["getSshCaPublicKey"] = async ({ dynamicSecretId, actor }) => {
    const dynamicSecretCfg = await dynamicSecretDAL.findOne({ id: dynamicSecretId });
    if (!dynamicSecretCfg) {
      throw new NotFoundError({ message: `Dynamic secret with ID '${dynamicSecretId}' not found` });
    }

    if (dynamicSecretCfg.type !== DynamicSecretProviders.Ssh) {
      throw new BadRequestError({ message: "Dynamic secret is not an SSH type" });
    }

    // Find the folder to get environment and path for permission check
    const folder = await folderDAL.findById(dynamicSecretCfg.folderId);
    if (!folder) {
      throw new NotFoundError({ message: "Dynamic secret folder not found" });
    }

    // Get the full secret path for the permission check
    const folderPaths = await folderDAL.findSecretPathByFolderIds(folder.projectId, [dynamicSecretCfg.folderId]);
    const secretPath = folderPaths?.[0]?.path || "/";

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: folder.projectId });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.EditRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets,
      fields: {
        environment: folder.environment.envSlug,
        secretPath,
        metadata: dynamicSecretCfg.metadata
      }
    });

    const { decryptor: secretManagerDecryptor } = await kmsCoreDomain.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: folder.projectId
    });

    const decryptedStoredInput = SshStoredSchema.pick({ caPublicKey: true }).parse(
      JSON.parse(secretManagerDecryptor({ cipherTextBlob: dynamicSecretCfg.encryptedInput }).toString())
    );

    return { caPublicKey: decryptedStoredInput.caPublicKey };
  };

  const fetchAzureEntraIdUsers: TDynamicSecretServiceFactory["fetchAzureEntraIdUsers"] = async ({
    tenantId,
    applicationId,
    clientSecret,
    projectSlug,
    actor
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: project.id });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets
    });

    const azureEntraIdUsers = await AzureEntraIDProvider().fetchAzureEntraIdUsers(
      tenantId,
      applicationId,
      clientSecret
    );
    return azureEntraIdUsers;
  };

  const fetchIbmApiConnectOrgs: TDynamicSecretServiceFactory["fetchIbmApiConnectOrgs"] = async ({
    instanceUrl,
    apiKey,
    clientId,
    clientSecret,
    projectSlug,
    actor
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: project.id });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets
    });

    return IbmApiConnectProvider().fetchOrganizations({ instanceUrl, apiKey, clientId, clientSecret });
  };

  const fetchIbmApiConnectOrgCatalogs: TDynamicSecretServiceFactory["fetchIbmApiConnectOrgCatalogs"] = async ({
    instanceUrl,
    apiKey,
    clientId,
    clientSecret,
    orgId,
    projectSlug,
    actor
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: project.id });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets
    });

    return IbmApiConnectProvider().fetchOrganizationCatalogs({ instanceUrl, apiKey, clientId, clientSecret }, orgId);
  };

  const fetchIbmApiConnectOrgApps: TDynamicSecretServiceFactory["fetchIbmApiConnectOrgApps"] = async ({
    instanceUrl,
    apiKey,
    clientId,
    clientSecret,
    orgId,
    catalogId,
    projectSlug,
    actor
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actor.org.id);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await secretsDomain.getSecretsPermission({ actor, projectId: project.id });

    permission.assert({
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets
    });

    return IbmApiConnectProvider().fetchOrganizationApps(
      { instanceUrl, apiKey, clientId, clientSecret },
      orgId,
      catalogId
    );
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
    fetchIbmApiConnectOrgs,
    fetchIbmApiConnectOrgCatalogs,
    fetchIbmApiConnectOrgApps,
    listDynamicSecretsByFolderIds,
    getSshCaPublicKey
  };
};
