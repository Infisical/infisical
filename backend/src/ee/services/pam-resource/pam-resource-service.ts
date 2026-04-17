import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TPamResources } from "@app/db/schemas";
import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor, TProjectPermission } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamAccountView } from "../pam-account/pam-account-enums";
import { decryptAccountCredentials, encryptAccountCredentials } from "../pam-account/pam-account-fns";
import { TPamResourceDALFactory } from "./pam-resource-dal";
import { PamResource } from "./pam-resource-enums";
import { PAM_RESOURCE_FACTORY_MAP } from "./pam-resource-factory";
import { TPamResourceFavoriteDALFactory } from "./pam-resource-favorite-dal";
import {
  decryptResource,
  decryptResourceConnectionDetails,
  decryptResourceMetadata,
  encryptResourceConnectionDetails,
  encryptResourceInternalMetadata,
  listResourceOptions
} from "./pam-resource-fns";
import { TCreateResourceDTO, TListResourcesDTO, TUpdateResourceDTO } from "./pam-resource-types";
import { TSSHResourceInternalMetadata } from "./ssh/ssh-resource-types";

// Extend this set as more LLM providers are added (e.g. AppConnection.OpenAI)
const LLM_APP_CONNECTIONS = new Set<AppConnection>([AppConnection.Anthropic]);

// Resource types that have AI session summary prompts defined in pam-session-summary-fns.ts
const AI_SUMMARY_SUPPORTED_RESOURCE_TYPES = new Set<PamResource>([PamResource.Postgres, PamResource.SSH]);

type TPamResourceServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  pamResourceFavoriteDAL: TPamResourceFavoriteDALFactory;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByProjectIdWithParentDetails" | "findMetadataByAccountIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getPAMConnectionDetails" | "getPlatformConnectionDetailsByGatewayId"
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
};

export type TPamResourceServiceFactory = ReturnType<typeof pamResourceServiceFactory>;

export const pamResourceServiceFactory = ({
  pamResourceDAL,
  pamResourceFavoriteDAL,
  pamAccountDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  resourceMetadataDAL,
  appConnectionDAL
}: TPamResourceServiceFactoryDep) => {
  const getById = async (id: string, resourceType: PamResource, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(id);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    // Fetch metadata for permission check
    const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds([resource.id]);
    const resourceMetadata = metadataByResourceId[resource.id] || [];

    const canReadResources = permission.can(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamResources, {
        name: resource.name,
        resourceType: resource.resourceType,
        metadata: resourceMetadata
      })
    );

    if (!canReadResources) {
      // Check if user can read at least one account in this resource
      const { accounts } = await pamAccountDAL.findByProjectIdWithParentDetails({
        projectId: resource.projectId,
        accountView: PamAccountView.Flat,
        filterResourceIds: [id]
      });

      const accountIds = accounts.map((a) => a.id);
      const accountMetadata = await pamAccountDAL.findMetadataByAccountIds(accountIds);

      const hasAccountAccess = accounts.some((account) => {
        return permission.can(
          ProjectPermissionPamAccountActions.Read,
          subject(ProjectPermissionSub.PamAccounts, {
            resourceName: resource.name,
            accountName: account.name,
            resourceType: resource.resourceType,
            metadata: accountMetadata[account.id] || []
          })
        );
      });

      if (!hasAccountAccess) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.PamResources, {
            name: resource.name,
            resourceType: resource.resourceType,
            metadata: resourceMetadata
          })
        );
      }
    }

    if (resource.resourceType !== resourceType) {
      throw new BadRequestError({
        message: `Resource with ID '${id}' is not of type '${resourceType}'`
      });
    }

    return {
      ...(await decryptResource(resource, resource.projectId, kmsService)),
      metadata: resourceMetadata
    };
  };

  const create = async (
    {
      resourceType,
      connectionDetails,
      gatewayId,
      name,
      projectId,
      rotationAccountCredentials,
      domainId,
      metadata
    }: TCreateResourceDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.PamResources, {
        name,
        resourceType,
        metadata: (metadata || []).map(({ key, value }) => ({ key, value: value ?? "" }))
      })
    );

    const factory = PAM_RESOURCE_FACTORY_MAP[resourceType](
      resourceType,
      connectionDetails,
      gatewayId,
      gatewayV2Service,
      projectId
    );

    const validatedConnectionDetails = await factory.validateConnection();
    const encryptedConnectionDetails = await encryptResourceConnectionDetails({
      connectionDetails: validatedConnectionDetails,
      projectId,
      kmsService
    });

    let encryptedRotationAccountCredentials: Buffer | null = null;

    if (rotationAccountCredentials) {
      const validatedRotationAccountCredentials = await factory.validateAccountCredentials(rotationAccountCredentials);

      encryptedRotationAccountCredentials = await encryptAccountCredentials({
        credentials: validatedRotationAccountCredentials,
        projectId,
        kmsService
      });
    }

    try {
      const { resource, insertedMetadata } = await pamResourceDAL.transaction(async (tx) => {
        const newResource = await pamResourceDAL.create(
          {
            resourceType,
            encryptedConnectionDetails,
            gatewayId,
            name,
            projectId,
            encryptedRotationAccountCredentials,
            domainId: domainId ?? null
          },
          tx
        );
        let metadataRows: Awaited<ReturnType<typeof resourceMetadataDAL.insertMany>> | undefined;
        if (metadata && metadata.length > 0) {
          metadataRows = await resourceMetadataDAL.insertMany(
            metadata.map(({ key, value }) => ({
              key,
              value: value ?? "",
              pamResourceId: newResource.id,
              orgId: actor.orgId
            })),
            tx
          );
        }
        return { resource: newResource, insertedMetadata: metadataRows };
      });

      return {
        ...(await decryptResource(resource, projectId, kmsService)),
        metadata: insertedMetadata?.map(({ id, key, value }) => ({ id, key, value: value ?? "" })) ?? []
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Resource with name '${name}' already exists for this project`
        });
      }
      throw err;
    }
  };

  const updateById = async (
    {
      connectionDetails,
      resourceId,
      name,
      rotationAccountCredentials,
      gatewayId,
      domainId,
      metadata,
      sessionSummaryConfig
    }: TUpdateResourceDTO,
    actor: OrgServiceActor
  ) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    // Fetch current metadata for permission check
    const existingMetadata = await pamResourceDAL.findMetadataByResourceIds([resourceId]);
    const currentMetadata = existingMetadata[resourceId] || [];

    // Check permission against current state
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.PamResources, {
        name: resource.name,
        resourceType: resource.resourceType,
        metadata: currentMetadata
      })
    );

    // If any conditionable field is changing, also check permission against proposed state
    if (metadata || name) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.PamResources, {
          name: name ?? resource.name,
          resourceType: resource.resourceType,
          metadata: metadata ? metadata.map(({ key, value }) => ({ key, value: value ?? "" })) : currentMetadata
        })
      );
    }

    const updateDoc: Partial<TPamResources> = {};

    const effectiveGatewayId = gatewayId !== undefined ? gatewayId : resource.gatewayId;

    if (gatewayId !== undefined) {
      updateDoc.gatewayId = gatewayId;
    }

    if (name !== undefined) {
      updateDoc.name = name;
    }

    if (domainId !== undefined) {
      updateDoc.domainId = domainId;
    }

    if (connectionDetails !== undefined) {
      const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
        resource.resourceType as PamResource,
        connectionDetails,
        effectiveGatewayId,
        gatewayV2Service,
        resource.projectId
      );
      const validatedConnectionDetails = await factory.validateConnection();
      const encryptedConnectionDetails = await encryptResourceConnectionDetails({
        connectionDetails: validatedConnectionDetails,
        projectId: resource.projectId,
        kmsService
      });
      updateDoc.encryptedConnectionDetails = encryptedConnectionDetails;
    }

    if (rotationAccountCredentials !== undefined) {
      updateDoc.encryptedRotationAccountCredentials = null;

      if (rotationAccountCredentials) {
        const decryptedConnectionDetails =
          connectionDetails ??
          (await decryptResourceConnectionDetails({
            encryptedConnectionDetails: resource.encryptedConnectionDetails,
            projectId: resource.projectId,
            kmsService
          }));

        const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
          resource.resourceType as PamResource,
          decryptedConnectionDetails,
          effectiveGatewayId,
          gatewayV2Service,
          resource.projectId
        );

        let finalCredentials = { ...rotationAccountCredentials };
        if (resource.encryptedRotationAccountCredentials) {
          const decryptedCredentials = await decryptAccountCredentials({
            encryptedCredentials: resource.encryptedRotationAccountCredentials,
            projectId: resource.projectId,
            kmsService
          });

          finalCredentials = await factory.handleOverwritePreventionForCensoredValues(
            rotationAccountCredentials,
            decryptedCredentials
          );
        }

        try {
          const validatedRotationAccountCredentials = await factory.validateAccountCredentials(finalCredentials);

          updateDoc.encryptedRotationAccountCredentials = await encryptAccountCredentials({
            credentials: validatedRotationAccountCredentials,
            projectId: resource.projectId,
            kmsService
          });
        } catch (err) {
          if (err instanceof BadRequestError) {
            throw new BadRequestError({
              message: `Rotation Account Error: ${err.message}`
            });
          }

          throw err;
        }
      }
    }

    if (sessionSummaryConfig !== undefined) {
      if (sessionSummaryConfig === null) {
        updateDoc.encryptedSessionSummaryConfig = null;
      } else {
        if (!AI_SUMMARY_SUPPORTED_RESOURCE_TYPES.has(resource.resourceType as PamResource)) {
          throw new BadRequestError({
            message: `AI session summaries are not supported for resource type '${resource.resourceType}'`
          });
        }

        const appConnection = await appConnectionDAL.findById(sessionSummaryConfig.connectionId);
        if (!appConnection) {
          throw new NotFoundError({
            message: `App connection with ID '${sessionSummaryConfig.connectionId}' not found`
          });
        }
        if (appConnection.orgId !== actor.orgId) {
          throw new BadRequestError({
            message: "App connection does not belong to the same organization as the resource"
          });
        }
        if (!LLM_APP_CONNECTIONS.has(appConnection.app as AppConnection)) {
          throw new BadRequestError({
            message: `App connection must be an AI provider connection, got '${appConnection.app}'`
          });
        }

        // Check actor has Connect permission on the app connection
        if (appConnection.projectId) {
          const { permission: appConnectionPermission } = await permissionService.getProjectPermission({
            actor: actor.type,
            actorId: actor.id,
            projectId: appConnection.projectId,
            actorAuthMethod: actor.authMethod,
            actorOrgId: actor.orgId,
            actionProjectType: ActionProjectType.Any
          });
          ForbiddenError.from(appConnectionPermission).throwUnlessCan(
            ProjectPermissionAppConnectionActions.Connect,
            subject(ProjectPermissionSub.AppConnections, { connectionId: sessionSummaryConfig.connectionId })
          );
        } else {
          const { permission: appConnectionPermission } = await permissionService.getOrgPermission({
            actorId: actor.id,
            actor: actor.type,
            orgId: appConnection.orgId,
            actorOrgId: actor.orgId,
            actorAuthMethod: actor.authMethod,
            scope: OrganizationActionScope.Any
          });
          ForbiddenError.from(appConnectionPermission).throwUnlessCan(
            OrgPermissionAppConnectionActions.Connect,
            subject(OrgPermissionSubjects.AppConnections, { connectionId: sessionSummaryConfig.connectionId })
          );
        }

        const { encryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: resource.projectId
        });
        const { cipherTextBlob } = encryptor({
          plainText: Buffer.from(JSON.stringify(sessionSummaryConfig))
        });
        updateDoc.encryptedSessionSummaryConfig = cipherTextBlob;
      }
    }

    // If nothing was updated, return the fetched resource
    if (Object.keys(updateDoc).length === 0 && metadata === undefined && sessionSummaryConfig === undefined) {
      const existingMeta = await pamResourceDAL.findMetadataByResourceIds([resourceId]);
      return {
        ...(await decryptResource(resource, resource.projectId, kmsService)),
        metadata: existingMeta[resourceId] || []
      };
    }

    try {
      const updatedResource = await pamResourceDAL.transaction(async (tx) => {
        if (metadata) {
          await resourceMetadataDAL.delete({ pamResourceId: resourceId }, tx);
          if (metadata.length > 0) {
            await resourceMetadataDAL.insertMany(
              metadata.map(({ key, value }) => ({
                key,
                value: value ?? "",
                pamResourceId: resourceId,
                orgId: actor.orgId
              })),
              tx
            );
          }
        }
        if (Object.keys(updateDoc).length > 0) {
          return pamResourceDAL.updateById(resourceId, updateDoc, tx);
        }
        return resource;
      });

      const freshMeta = await pamResourceDAL.findMetadataByResourceIds([resourceId]);

      return {
        ...(await decryptResource(updatedResource, resource.projectId, kmsService)),
        metadata: freshMeta[resourceId] || []
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Resource with name '${name}' already exists for this project`
        });
      }
      throw err;
    }
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(id);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${id}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds([id]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.PamResources, {
        name: resource.name,
        resourceType: resource.resourceType,
        metadata: metadataByResourceId[id] || []
      })
    );

    try {
      const deletedResource = await pamResourceDAL.deleteById(id);
      return await decryptResource(deletedResource, resource.projectId, kmsService);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message: "Failed to delete resource because it is attached to active PAM accounts"
        });
      }
      throw err;
    }
  };

  const list = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId, ...params }: TListResourcesDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    // Check what kind of PamResources read rules the user has
    const canReadResources = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.PamResources);

    if (canReadResources) {
      // Check if rules have conditions
      const resourceRules = permission.rulesFor(ProjectPermissionActions.Read, ProjectPermissionSub.PamResources);
      const hasConditions = resourceRules.some((rule) => rule.conditions || rule.inverted);

      if (!hasConditions) {
        // TIER 1: Unconditional access — fast path with DB pagination (existing behavior)
        const { resources, totalCount } = await pamResourceDAL.findByProjectId({
          projectId,
          userId: actorId,
          ...params
        });
        const resourceIds = resources.map((r) => r.id);
        const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds(resourceIds);
        return {
          resources: await Promise.all(
            resources.map(async (resource) => ({
              ...(await decryptResource(resource, projectId, kmsService)),
              metadata: metadataByResourceId[resource.id] || [],
              isFavorite: resource.isFavorite
            }))
          ),
          totalCount
        };
      }
    }

    // Fetch all resources once for both Tier 2 and Tier 3
    const { resources: allResources } = await pamResourceDAL.findByProjectId({
      projectId,
      userId: actorId,
      search: params.search,
      orderBy: params.orderBy,
      orderDirection: params.orderDirection,
      filterResourceTypes: params.filterResourceTypes,
      metadataFilter: params.metadataFilter
    });

    if (allResources.length === 0) {
      return { resources: [], totalCount: 0 };
    }

    // TIER 2: Conditional access — filter per-resource
    if (canReadResources) {
      const allResourceIds = allResources.map((r) => r.id);
      const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds(allResourceIds);

      const permittedResources = allResources.filter((resource) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.PamResources, {
            name: resource.name,
            resourceType: resource.resourceType,
            metadata: metadataByResourceId[resource.id] || []
          })
        )
      );

      if (permittedResources.length > 0) {
        const totalCount = permittedResources.length;
        const offset = params.offset || 0;
        const limit = params.limit || 100;
        const paginatedResources = permittedResources.slice(offset, offset + limit);

        return {
          resources: await Promise.all(
            paginatedResources.map(async (resource) => ({
              ...(await decryptResource(resource, projectId, kmsService)),
              metadata: metadataByResourceId[resource.id] || [],
              isFavorite: resource.isFavorite
            }))
          ),
          totalCount
        };
      }
    }

    // Fetch all accounts for the project (flat view, no pagination) for permission checking
    const { accounts: allAccounts } = await pamAccountDAL.findByProjectIdWithParentDetails({
      projectId,
      accountView: PamAccountView.Flat
    });

    if (allAccounts.length === 0) {
      return { resources: [], totalCount: 0 };
    }

    // Fetch account metadata for permission checks
    const allAccountIds = allAccounts.map((a) => a.id);
    const accountMetadata = await pamAccountDAL.findMetadataByAccountIds(allAccountIds);

    // Group accounts by resource ID
    const accountsByResourceId = new Map<
      string,
      Array<{ accountName: string; metadata: Array<{ id: string; key: string; value: string }> }>
    >();
    for (const account of allAccounts) {
      if (account.resourceId) {
        // Skip domain accounts for resource-level permission check
        const existing = accountsByResourceId.get(account.resourceId) || [];
        existing.push({ accountName: account.name, metadata: accountMetadata[account.id] || [] });
        accountsByResourceId.set(account.resourceId, existing);
      }
    }

    // Filter to only resources where the user can read at least one account
    const permittedResources = allResources.filter((resource) => {
      const accounts = accountsByResourceId.get(resource.id) || [];
      return accounts.some((account) =>
        permission.can(
          ProjectPermissionPamAccountActions.Read,
          subject(ProjectPermissionSub.PamAccounts, {
            resourceName: resource.name,
            accountName: account.accountName,
            resourceType: resource.resourceType,
            metadata: account.metadata
          })
        )
      );
    });

    const totalCount = permittedResources.length;
    const offset = params.offset || 0;
    const limit = params.limit || 100;
    const paginatedResources = permittedResources.slice(offset, offset + limit);

    const paginatedResourceIds = paginatedResources.map((r) => r.id);
    const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds(paginatedResourceIds);

    return {
      resources: await Promise.all(
        paginatedResources.map(async (resource) => ({
          ...(await decryptResource(resource, projectId, kmsService)),
          metadata: metadataByResourceId[resource.id] || [],
          isFavorite: resource.isFavorite
        }))
      ),
      totalCount
    };
  };

  const getOrCreateSshCa = async (resourceId: string, actor: OrgServiceActor) => {
    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });

    if (resource.resourceType !== PamResource.SSH) {
      throw new BadRequestError({ message: "This operation is only available for SSH resources" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: resource.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds([resourceId]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.PamResources, {
        name: resource.name,
        resourceType: resource.resourceType,
        metadata: metadataByResourceId[resourceId] || []
      })
    );

    // Check if metadata already exists with CA
    if (resource.encryptedResourceMetadata) {
      const metadata = await decryptResourceMetadata<TSSHResourceInternalMetadata>({
        encryptedMetadata: resource.encryptedResourceMetadata,
        projectId: resource.projectId,
        kmsService
      });
      return { caPublicKey: metadata.caPublicKey };
    }

    // Transaction with advisory lock to prevent race conditions
    const caPublicKey = await pamResourceDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.PamResourceSshCaInit(resourceId)]);

      // Re-check after acquiring lock in case another transaction created it
      const currentResource = await pamResourceDAL.findById(resourceId, tx);
      if (currentResource?.encryptedResourceMetadata) {
        const metadata = await decryptResourceMetadata<TSSHResourceInternalMetadata>({
          encryptedMetadata: currentResource.encryptedResourceMetadata,
          projectId: currentResource.projectId,
          kmsService
        });
        return metadata.caPublicKey;
      }

      // Generate new CA key pair
      const keyAlgorithm = SshCertKeyAlgorithm.ED25519;
      const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

      const internalMetadata: TSSHResourceInternalMetadata = {
        caPrivateKey: privateKey,
        caPublicKey: publicKey.trim(),
        caKeyAlgorithm: keyAlgorithm
      };

      const encryptedResourceMetadata = await encryptResourceInternalMetadata({
        internalMetadata,
        projectId: resource.projectId,
        kmsService
      });

      await pamResourceDAL.updateById(resourceId, { encryptedResourceMetadata }, tx);

      return internalMetadata.caPublicKey;
    });

    return { caPublicKey };
  };

  const setUserResourceFavorite = async ({
    projectId,
    resourceId,
    isFavorite,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TProjectPermission & {
    resourceId: string;
    isFavorite: boolean;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorAuthMethod,
      actorId,
      actorOrgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const userId = actorId;

    const resource = await pamResourceDAL.findById(resourceId);
    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });
    }

    const metadataByResourceId = await pamResourceDAL.findMetadataByResourceIds([resourceId]);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.PamResources, {
        name: resource.name,
        resourceType: resource.resourceType,
        metadata: metadataByResourceId[resource.id] || []
      })
    );

    if (isFavorite) {
      await pamResourceFavoriteDAL.upsert(
        [{ userId, pamResourceId: resourceId, projectId }],
        ["userId", "pamResourceId"]
      );
    } else {
      await pamResourceFavoriteDAL.delete({ userId, pamResourceId: resourceId });
    }
  };

  return {
    getById,
    create,
    updateById,
    deleteById,
    list,
    listResourceOptions,
    getOrCreateSshCa,
    setUserResourceFavorite
  };
};
