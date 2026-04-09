import { ForbiddenError, subject } from "@casl/ability";
import picomatch from "picomatch";

import { ActionProjectType, OrganizationActionScope, TableName, TPamAccounts, TPamResources } from "@app/db/schemas";
import { decryptDomainConnectionDetails } from "@app/ee/services/pam-domain/pam-domain-fns";
import {
  extractAwsAccountIdFromArn,
  generateConsoleFederationUrl,
  TAwsIamAccountCredentials
} from "@app/ee/services/pam-resource/aws-iam";
import { parseMongoConnectionString } from "@app/ee/services/pam-resource/mongodb/mongodb-resource-factory";
import { PAM_RESOURCE_FACTORY_MAP } from "@app/ee/services/pam-resource/pam-resource-factory";
import {
  decryptResource,
  decryptResourceConnectionDetails,
  decryptResourceMetadata
} from "@app/ee/services/pam-resource/pam-resource-fns";
import { SSHAuthMethod } from "@app/ee/services/pam-resource/ssh/ssh-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { createSshCert, createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertType } from "@app/ee/services/ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import {
  BadRequestError,
  DatabaseError,
  ForbiddenRequestError,
  NotFoundError,
  PolicyViolationError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { APPROVAL_POLICY_FACTORY_MAP } from "@app/services/approval-policy/approval-policy-factory";
import { TApprovalRequestGrantsDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { ActorType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { MfaSessionStatus } from "@app/services/mfa-session/mfa-session-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TPamSessionExpirationServiceFactory } from "@app/services/pam-session-expiration/pam-session-expiration-queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TPamAccountDependenciesDALFactory } from "../pam-discovery/pam-account-dependencies-dal";
import { TPamDomainDALFactory } from "../pam-domain/pam-domain-dal";
import { PamDomainType } from "../pam-domain/pam-domain-enums";
import { PAM_DOMAIN_FACTORY_MAP } from "../pam-domain/pam-domain-factory";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamResourceRotationRulesDALFactory } from "../pam-resource/pam-resource-rotation-rules-dal";
import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";
import { TRedisAccountCredentials } from "../pam-resource/redis/redis-resource-types";
import { TSqlAccountCredentials, TSqlResourceConnectionDetails } from "../pam-resource/shared/sql/sql-resource-types";
import { TSSHAccountCredentials, TSSHResourceInternalMetadata } from "../pam-resource/ssh/ssh-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { PamAccountRotationStatus } from "./pam-account-enums";
import {
  decryptAccount,
  decryptAccountCredentials,
  encryptAccountCredentials,
  hasSensitiveCredentials
} from "./pam-account-fns";
import {
  TAccessAccountDTO,
  TCreateAccountDTO,
  TGetAccountByIdDTO,
  TListAccountsDTO,
  TUpdateAccountDTO,
  TViewAccountCredentialsDTO
} from "./pam-account-types";

type TPamAccountServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  pamDomainDAL: TPamDomainDALFactory;
  pamSessionDAL: TPamSessionDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamResourceRotationRulesDAL: Pick<TPamResourceRotationRulesDALFactory, "findByResourceIds">;
  mfaSessionService: TMfaSessionServiceFactory;
  projectDAL: TProjectDALFactory;
  orgDAL: TOrgDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getPAMConnectionDetails" | "getPlatformConnectionDetailsByGatewayId"
  >;
  userDAL: TUserDALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
  pamSessionExpirationService: Pick<TPamSessionExpirationServiceFactory, "scheduleSessionExpiration">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  pamAccountDependenciesDAL: Pick<
    TPamAccountDependenciesDALFactory,
    "findByAccountId" | "updateById" | "countByAccountIds"
  >;
};

export type TPamAccountServiceFactory = ReturnType<typeof pamAccountServiceFactory>;

const ROTATION_CONCURRENCY_LIMIT = 10;

export const pamAccountServiceFactory = ({
  pamResourceDAL,
  pamDomainDAL,
  pamSessionDAL,
  pamAccountDAL,
  pamResourceRotationRulesDAL,
  mfaSessionService,
  projectDAL,
  orgDAL,
  userDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  auditLogService,
  approvalPolicyDAL,
  approvalRequestGrantsDAL,
  pamSessionExpirationService,
  resourceMetadataDAL,
  pamAccountDependenciesDAL
}: TPamAccountServiceFactoryDep) => {
  // Helper to resolve account parent (resource or domain)
  const resolveAccountParent = async ({
    resourceId,
    domainId
  }: {
    resourceId?: string | null;
    domainId?: string | null;
  }) => {
    if (resourceId) {
      const resource = await pamResourceDAL.findById(resourceId);
      if (!resource) throw new NotFoundError({ message: `Resource with ID '${resourceId}' not found` });
      return {
        projectId: resource.projectId,
        name: resource.name,
        resourceType: resource.resourceType,
        domainType: null as string | null,
        gatewayId: resource.gatewayId,
        encryptedConnectionDetails: resource.encryptedConnectionDetails,
        encryptedResourceMetadata: resource.encryptedResourceMetadata,
        encryptedRotationAccountCredentials: resource.encryptedRotationAccountCredentials,
        isResource: true as const,
        raw: resource
      };
    }
    if (!domainId) throw new BadRequestError({ message: "Either resourceId or domainId must be provided" });
    const domain = await pamDomainDAL.findById(domainId);
    if (!domain) throw new NotFoundError({ message: `Domain with ID '${domainId}' not found` });
    return {
      projectId: domain.projectId,
      name: domain.name,
      resourceType: null as string | null,
      domainType: domain.domainType,
      gatewayId: domain.gatewayId,
      encryptedConnectionDetails: domain.encryptedConnectionDetails,
      encryptedResourceMetadata: null as Buffer | null,
      encryptedRotationAccountCredentials: null as Buffer | null,
      isResource: false as const,
      raw: domain
    };
  };

  const create = async (
    {
      credentials,
      resourceId,
      domainId,
      name,
      description,
      folderId,
      requireMfa,
      internalMetadata,
      metadata
    }: TCreateAccountDTO,
    actor: OrgServiceActor
  ) => {
    const parent = await resolveAccountParent({ resourceId, domainId });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: parent.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Create,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: name,
        ...(parent.isResource && { resourceName: parent.name, resourceType: parent.resourceType }),
        ...(!parent.isResource && { domainName: parent.name, domainType: parent.domainType }),
        metadata: (metadata || []).map(({ key, value }) => ({ key, value: value ?? "" }))
      })
    );

    let factory;
    if (parent.isResource) {
      const connectionDetails = await decryptResourceConnectionDetails({
        projectId: parent.projectId,
        encryptedConnectionDetails: parent.encryptedConnectionDetails,
        kmsService
      });
      const resourceInternalMetadata = parent.encryptedResourceMetadata
        ? await decryptResourceMetadata({
            encryptedMetadata: parent.encryptedResourceMetadata,
            projectId: parent.projectId,
            kmsService
          })
        : undefined;
      factory = PAM_RESOURCE_FACTORY_MAP[parent.resourceType as PamResource](
        parent.resourceType as PamResource,
        connectionDetails,
        parent.gatewayId,
        gatewayV2Service,
        parent.projectId,
        resourceInternalMetadata
      );
    } else {
      const connectionDetails = await decryptDomainConnectionDetails({
        projectId: parent.projectId,
        encryptedConnectionDetails: parent.encryptedConnectionDetails,
        kmsService
      });
      factory = PAM_DOMAIN_FACTORY_MAP[parent.domainType as PamDomainType](
        parent.domainType as PamDomainType,
        connectionDetails,
        parent.gatewayId,
        gatewayV2Service,
        parent.projectId
      );
    }
    const validatedCredentials = await factory.validateAccountCredentials(credentials);

    const encryptedCredentials = await encryptAccountCredentials({
      credentials: validatedCredentials,
      projectId: parent.projectId,
      kmsService
    });

    try {
      const { account, insertedMetadata } = await pamAccountDAL.transaction(async (tx) => {
        const newAccount = await pamAccountDAL.create(
          {
            projectId: parent.projectId,
            resourceId: resourceId || null,
            domainId: domainId || null,
            encryptedCredentials,
            name,
            description,
            folderId,
            requireMfa,
            internalMetadata: internalMetadata ?? null
          },
          tx
        );

        let metadataRows: Awaited<ReturnType<typeof resourceMetadataDAL.insertMany>> | undefined;
        if (metadata && metadata.length > 0) {
          metadataRows = await resourceMetadataDAL.insertMany(
            metadata.map(({ key, value }) => ({
              key,
              value: value ?? "",
              pamAccountId: newAccount.id,
              orgId: actor.orgId
            })),
            tx
          );
        }

        return { account: newAccount, insertedMetadata: metadataRows };
      });

      return {
        ...(await decryptAccount(account, parent.projectId, kmsService)),
        parentType: (parent.resourceType || parent.domainType)!,
        metadata: insertedMetadata?.map(({ id, key, value }) => ({ id, key, value: value ?? "" })) ?? [],
        resource: parent.isResource
          ? {
              id: parent.raw.id,
              name: parent.name,
              resourceType: parent.resourceType,
              rotationCredentialsConfigured: !!parent.encryptedRotationAccountCredentials
            }
          : null,
        domain: !parent.isResource
          ? {
              id: parent.raw.id,
              name: parent.name,
              domainType: parent.domainType
            }
          : null
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Account with name '${name}' already exists`
        });
      }

      throw err;
    }
  };

  const updateById = async (
    { accountId, credentials, description, name, requireMfa, internalMetadata, metadata }: TUpdateAccountDTO,
    actor: OrgServiceActor
  ) => {
    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const parent = await resolveAccountParent(account);
    const resource = parent.isResource ? (parent.raw as TPamResources) : null;

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const existingAccountMeta = await pamAccountDAL.findMetadataByAccountIds([accountId]);
    const currentMetadata = existingAccountMeta[accountId] || [];

    // Check against current state
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: account.name,
        ...(parent.isResource && { resourceName: parent.name, resourceType: parent.resourceType }),
        ...(!parent.isResource && { domainName: parent.name, domainType: parent.domainType }),
        metadata: currentMetadata
      })
    );

    // If any conditionable field is changing, also check permission against proposed state
    if (metadata || name) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPamAccountActions.Edit,
        subject(ProjectPermissionSub.PamAccounts, {
          accountName: name ?? account.name,
          ...(parent.isResource && { resourceName: parent.name, resourceType: parent.resourceType }),
          ...(!parent.isResource && { domainName: parent.name, domainType: parent.domainType }),
          metadata: metadata ? metadata.map(({ key, value }) => ({ key, value: value ?? "" })) : currentMetadata
        })
      );
    }

    const updateDoc: Partial<TPamAccounts> = {};

    if (name !== undefined) {
      updateDoc.name = name;
    }

    if (requireMfa !== undefined) {
      updateDoc.requireMfa = requireMfa;
    }

    if (description !== undefined) {
      updateDoc.description = description;
    }

    if (internalMetadata !== undefined) {
      updateDoc.internalMetadata = internalMetadata;
    }

    if (credentials !== undefined) {
      let factory;
      if (parent.isResource) {
        const connectionDetails = await decryptResourceConnectionDetails({
          projectId: account.projectId,
          encryptedConnectionDetails: parent.encryptedConnectionDetails,
          kmsService
        });
        const resourceInternalMetadata = parent.encryptedResourceMetadata
          ? await decryptResourceMetadata({
              encryptedMetadata: parent.encryptedResourceMetadata,
              projectId: account.projectId,
              kmsService
            })
          : undefined;
        factory = PAM_RESOURCE_FACTORY_MAP[parent.resourceType as PamResource](
          parent.resourceType as PamResource,
          connectionDetails,
          parent.gatewayId,
          gatewayV2Service,
          account.projectId,
          resourceInternalMetadata
        );
      } else {
        const connectionDetails = await decryptDomainConnectionDetails({
          projectId: account.projectId,
          encryptedConnectionDetails: parent.encryptedConnectionDetails,
          kmsService
        });
        factory = PAM_DOMAIN_FACTORY_MAP[parent.domainType as PamDomainType](
          parent.domainType as PamDomainType,
          connectionDetails,
          parent.gatewayId,
          gatewayV2Service,
          account.projectId
        );
      }

      const decryptedCredentials = await decryptAccountCredentials({
        encryptedCredentials: account.encryptedCredentials,
        projectId: account.projectId,
        kmsService
      });

      // Logic to prevent overwriting unedited censored values
      const finalCredentials = await factory.handleOverwritePreventionForCensoredValues(
        credentials,
        decryptedCredentials
      );

      const validatedCredentials = await factory.validateAccountCredentials(finalCredentials);
      const encryptedCredentials = await encryptAccountCredentials({
        credentials: validatedCredentials,
        projectId: account.projectId,
        kmsService
      });
      updateDoc.encryptedCredentials = encryptedCredentials;
    }

    // If nothing was updated, return the fetched account
    if (Object.keys(updateDoc).length === 0 && metadata === undefined) {
      const existingMeta = await pamAccountDAL.findMetadataByAccountIds([accountId]);
      return {
        ...(await decryptAccount(account, account.projectId, kmsService)),
        parentType: resource?.resourceType || (!parent.isResource ? parent.domainType : "") || "",
        metadata: existingMeta[accountId] || [],
        resource: resource
          ? {
              id: resource.id,
              name: resource.name,
              resourceType: resource.resourceType,
              rotationCredentialsConfigured: !!resource.encryptedRotationAccountCredentials
            }
          : null,
        domain: !parent.isResource
          ? {
              id: parent.raw.id,
              name: parent.name,
              domainType: parent.domainType
            }
          : null
      };
    }

    try {
      const updatedAccount = await pamAccountDAL.transaction(async (tx) => {
        if (metadata) {
          await resourceMetadataDAL.delete({ pamAccountId: accountId }, tx);
          if (metadata.length > 0) {
            await resourceMetadataDAL.insertMany(
              metadata.map(({ key, value }) => ({
                key,
                value: value ?? "",
                pamAccountId: accountId,
                orgId: actor.orgId
              })),
              tx
            );
          }
        }
        if (Object.keys(updateDoc).length > 0) {
          return pamAccountDAL.updateById(accountId, updateDoc, tx);
        }
        return account;
      });

      const freshMeta = await pamAccountDAL.findMetadataByAccountIds([accountId]);

      return {
        ...(await decryptAccount(updatedAccount, account.projectId, kmsService)),
        parentType: resource?.resourceType || (!parent.isResource ? parent.domainType : "") || "",
        metadata: freshMeta[accountId] || [],
        resource: resource
          ? {
              id: resource.id,
              name: resource.name,
              resourceType: resource.resourceType,
              rotationCredentialsConfigured: !!resource.encryptedRotationAccountCredentials
            }
          : null,
        domain: !parent.isResource
          ? {
              id: parent.raw.id,
              name: parent.name,
              domainType: parent.domainType
            }
          : null
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Account with name '${name}' already exists for this resource`
        });
      }

      throw err;
    }
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const account = await pamAccountDAL.findById(id);
    if (!account) throw new NotFoundError({ message: `Account with ID '${id}' not found` });

    const parent = await resolveAccountParent(account);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountMeta = await pamAccountDAL.findMetadataByAccountIds([id]);

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Delete,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: account.name,
        ...(parent.isResource && { resourceName: parent.name, resourceType: parent.resourceType }),
        ...(!parent.isResource && { domainName: parent.name, domainType: parent.domainType }),
        metadata: accountMeta[id] || []
      })
    );

    const deletedAccount = await pamAccountDAL.deleteById(id);

    return {
      ...(await decryptAccount(deletedAccount, account.projectId, kmsService)),
      parentType: (parent.resourceType || parent.domainType)!,
      resource: parent.isResource
        ? {
            id: parent.raw.id,
            name: parent.name,
            resourceType: parent.resourceType,
            rotationCredentialsConfigured: !!parent.encryptedRotationAccountCredentials
          }
        : null,
      domain: !parent.isResource
        ? {
            id: parent.raw.id,
            name: parent.name,
            domainType: parent.domainType
          }
        : null
    };
  };

  const list = async ({
    projectId,
    accountView,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    ...params
  }: TListAccountsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const { accounts: accountsWithParentDetails, totalCount } = await pamAccountDAL.findByProjectIdWithParentDetails({
      projectId,
      accountView,
      offset,
      limit,
      search: params.search,
      orderBy: params.orderBy,
      orderDirection: params.orderDirection,
      filterResourceIds: params.filterResourceIds,
      filterDomainIds: params.filterDomainIds,
      metadataFilter: params.metadataFilter
    });

    const decryptedAndPermittedAccounts: Array<
      Omit<TPamAccounts, "encryptedCredentials" | "encryptedLastRotationMessage"> & {
        resource:
          | (Pick<TPamResources, "id" | "name" | "resourceType"> & { rotationCredentialsConfigured: boolean })
          | null;
        domain: { id: string; name: string; domainType: string } | null;
        credentials: TPamAccountCredentials;
        lastRotationMessage: string | null;
      }
    > = [];

    // Fetch metadata for all accounts before permission loop
    const allAccountIds = accountsWithParentDetails.map((a) => a.id);
    const metadataByAccountId = await pamAccountDAL.findMetadataByAccountIds(allAccountIds);

    for await (const account of accountsWithParentDetails) {
      if (
        permission.can(
          ProjectPermissionPamAccountActions.Read,
          subject(ProjectPermissionSub.PamAccounts, {
            accountName: account.name,
            ...(account.resource && {
              resourceName: account.resource.name,
              resourceType: account.resource.resourceType
            }),
            ...(account.domain && { domainName: account.domain.name, domainType: account.domain.domainType }),
            metadata: metadataByAccountId[account.id] || []
          })
        )
      ) {
        // Decrypt the account only if the user has permission to read it
        const decryptedAccount = await decryptAccount(
          account as Parameters<typeof decryptAccount>[0],
          account.projectId,
          kmsService
        );

        decryptedAndPermittedAccounts.push({
          ...decryptedAccount,
          parentType: account.resource?.resourceType || account.domain?.domainType || "",
          resource: account.resource
            ? {
                id: account.resource.id,
                name: account.resource.name,
                resourceType: account.resource.resourceType,
                rotationCredentialsConfigured: !!account.resource.encryptedRotationAccountCredentials
              }
            : null,
          domain: account.domain
            ? {
                id: account.domain.id,
                name: account.domain.name,
                domainType: account.domain.domainType
              }
            : null
        } as unknown as (typeof decryptedAndPermittedAccounts)[0]);
      }
    }

    // Fetch dependency counts for all permitted accounts
    const permittedAccountIds = decryptedAndPermittedAccounts.map((a) => a.id);
    const dependencyCountMap =
      permittedAccountIds.length > 0 ? await pamAccountDependenciesDAL.countByAccountIds(permittedAccountIds) : {};

    return {
      accounts: decryptedAndPermittedAccounts.map((a) => ({
        ...a,
        metadata: metadataByAccountId[a.id] || [],
        dependencyCount: dependencyCountMap[a.id] || 0
      })),
      totalCount
    };
  };

  const getById = async ({ accountId, actor, actorId, actorAuthMethod, actorOrgId }: TGetAccountByIdDTO) => {
    const accountWithParent = await pamAccountDAL.findByIdWithParentDetails(accountId);
    if (!accountWithParent) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accountWithParent.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByAccountId = await pamAccountDAL.findMetadataByAccountIds([accountWithParent.id]);
    const accountMetadata = metadataByAccountId[accountWithParent.id] || [];

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Read,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: accountWithParent.name,
        ...(accountWithParent.resource && {
          resourceName: accountWithParent.resource.name,
          resourceType: accountWithParent.resource.resourceType
        }),
        ...(accountWithParent.domain && {
          domainName: accountWithParent.domain.name,
          domainType: accountWithParent.domain.domainType
        }),
        metadata: accountMetadata
      })
    );

    const decryptedAccount = await decryptAccount(accountWithParent, accountWithParent.projectId, kmsService);

    return {
      ...decryptedAccount,
      parentType: accountWithParent.resource?.resourceType || accountWithParent.domain?.domainType || "",
      metadata: accountMetadata,
      resource: accountWithParent.resource
        ? {
            id: accountWithParent.resource.id,
            name: accountWithParent.resource.name,
            resourceType: accountWithParent.resource.resourceType,
            rotationCredentialsConfigured: !!accountWithParent.resource.encryptedRotationAccountCredentials
          }
        : null,
      domain: accountWithParent.domain
        ? {
            id: accountWithParent.domain.id,
            name: accountWithParent.domain.name,
            domainType: accountWithParent.domain.domainType
          }
        : null
    };
  };

  const access = async (
    {
      resourceName: inputResourceName,
      accountName: inputAccountName,
      projectId,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      duration,
      mfaSessionId
    }: TAccessAccountDTO,
    actor: OrgServiceActor
  ) => {
    // Find resource by name
    const resource = await pamResourceDAL.findOne({ projectId, name: inputResourceName });
    if (!resource) {
      throw new NotFoundError({ message: `Resource with name '${inputResourceName}' not found` });
    }

    // Find account by name within the resource
    const account = await pamAccountDAL.findOne({
      projectId,
      resourceId: resource.id,
      name: inputAccountName
    });

    if (!account) {
      throw new NotFoundError({
        message: `Account with name '${inputAccountName}' not found for resource '${inputResourceName}'`
      });
    }

    const fac = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.PamAccess](ApprovalPolicyType.PamAccess);

    const inputs = {
      resourceId: resource.id,
      resourceName: resource.name,
      accountName: account.name
    };

    const canAccess = await fac.canAccess(approvalRequestGrantsDAL, resource.projectId, actor.id, inputs);

    // Grant does not exist, check policy and fallback to permission check
    if (!canAccess) {
      const policy = await fac.matchPolicy(approvalPolicyDAL, resource.projectId, inputs);

      if (policy) {
        throw new PolicyViolationError({
          message: "A policy is in place for this resource",
          details: {
            policyId: policy.id,
            policyName: policy.name,
            policyType: policy.type
          }
        });
      }

      // If there isn't a policy in place, continue with checking permission
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorAuthMethod: actor.authMethod,
        actorId: actor.id,
        actorOrgId: actor.orgId,
        projectId: account.projectId,
        actionProjectType: ActionProjectType.PAM
      });

      const accountMeta = await pamAccountDAL.findMetadataByAccountIds([account.id]);

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPamAccountActions.Access,
        subject(ProjectPermissionSub.PamAccounts, {
          resourceName: resource.name,
          accountName: account.name,
          resourceType: resource.resourceType,
          metadata: accountMeta[account.id] || []
        })
      );
    }

    const project = await projectDAL.findById(account.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${account.projectId}' not found` });

    const actorUser = await userDAL.findById(actor.id);
    if (!actorUser) throw new NotFoundError({ message: `User with ID '${actor.id}' not found` });

    // If no mfaSessionId is provided, create a new MFA session
    if (!mfaSessionId && account.requireMfa) {
      // Get organization to check if MFA is enforced at org level
      const org = await orgDAL.findOrgById(project.orgId);
      if (!org) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

      // Determine which MFA method to use
      // Priority: org-enforced > user-selected > email as fallback
      const orgMfaMethod = org.enforceMfa ? (org.selectedMfaMethod as MfaMethod | null) : undefined;
      const userMfaMethod = actorUser.isMfaEnabled ? (actorUser.selectedMfaMethod as MfaMethod | null) : undefined;
      const mfaMethod = (orgMfaMethod ?? userMfaMethod ?? MfaMethod.EMAIL) as MfaMethod;

      // Create MFA session
      const newMfaSessionId = await mfaSessionService.createMfaSession(actorUser.id, account.id, mfaMethod);

      // If MFA method is email, send the code immediately
      if (mfaMethod === MfaMethod.EMAIL && actorUser.email) {
        await mfaSessionService.sendMfaCode(actorUser.id, actorUser.email);
      }

      // Throw an error with the mfaSessionId to signal that MFA is required
      throw new BadRequestError({
        message: "MFA verification required to access PAM account",
        name: "SESSION_MFA_REQUIRED",
        details: {
          mfaSessionId: newMfaSessionId,
          mfaMethod
        }
      });
    }

    if (mfaSessionId && account.requireMfa) {
      const mfaSession = await mfaSessionService.getMfaSession(mfaSessionId);
      if (!mfaSession) {
        throw new BadRequestError({
          message: "MFA session not found or expired"
        });
      }

      // Verify the session belongs to the current user
      if (mfaSession.userId !== actor.id) {
        throw new BadRequestError({
          message: "MFA session does not belong to current user"
        });
      }

      // Verify the session is for the same account
      if (mfaSession.resourceId !== account.id) {
        throw new BadRequestError({
          message: "MFA session is for a different account"
        });
      }

      // Check if MFA session is active
      if (mfaSession.status !== MfaSessionStatus.ACTIVE) {
        throw new BadRequestError({
          message: "MFA session is not active. Please complete MFA verification first."
        });
      }

      // MFA verified successfully, delete the session and proceed with access
      await mfaSessionService.deleteMfaSession(mfaSessionId);
    }

    const { connectionDetails, gatewayId, resourceType } = await decryptResource(
      resource,
      account.projectId,
      kmsService
    );

    // Temporarily disable access to Windows Server
    if (resourceType === PamResource.Windows)
      throw new BadRequestError({ message: `Windows resources cannot be accessed at this time` });

    const user = await userDAL.findById(actor.id);
    if (!user) throw new NotFoundError({ message: `User with ID '${actor.id}' not found` });

    if (resourceType === PamResource.AwsIam) {
      const awsCredentials = (await decryptAccountCredentials({
        encryptedCredentials: account.encryptedCredentials,
        kmsService,
        projectId: account.projectId
      })) as TAwsIamAccountCredentials;

      const { consoleUrl, expiresAt } = await generateConsoleFederationUrl({
        connectionDetails,
        targetRoleArn: awsCredentials.targetRoleArn,
        roleSessionName: actorEmail,
        projectId: account.projectId, // Use project ID as External ID for security
        sessionDuration: awsCredentials.defaultSessionDuration
      });

      const session = await pamSessionDAL.create({
        accountName: account.name,
        actorEmail,
        actorIp,
        actorName,
        actorUserAgent,
        projectId: account.projectId,
        resourceName: resource.name,
        resourceType: resource.resourceType,
        status: PamSessionStatus.Active, // AWS IAM sessions are immediately active
        accountId: account.id,
        userId: actor.id,
        expiresAt,
        startedAt: new Date()
      });

      // Schedule session expiration job to run at expiresAt
      await pamSessionExpirationService.scheduleSessionExpiration(session.id, expiresAt);

      return {
        sessionId: session.id,
        resourceType,
        account,
        consoleUrl,
        metadata: {
          awsAccountId: extractAwsAccountIdFromArn(connectionDetails.roleArn),
          targetRoleArn: awsCredentials.targetRoleArn,
          federatedUsername: actorEmail,
          expiresAt: expiresAt.toISOString()
        }
      };
    }

    // For gateway-based resources (Postgres, MySQL, SSH), create session first
    const session = await pamSessionDAL.create({
      accountName: account.name,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      projectId,
      resourceName: resource.name,
      resourceType: resource.resourceType,
      status: PamSessionStatus.Starting,
      accountId: account.id,
      userId: actor.id,
      expiresAt: new Date(Date.now() + duration)
    });

    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required for this resource type" });
    }

    const { host, port } = (() => {
      if (resourceType === PamResource.Kubernetes) {
        const url = new URL(connectionDetails.url);
        let portNumber: number | undefined;
        if (url.port) {
          portNumber = Number(url.port);
        } else {
          portNumber = url.protocol === "https:" ? 443 : 80;
        }
        return { host: url.hostname, port: portNumber };
      }

      if (resourceType === PamResource.MongoDB) {
        const parsed = parseMongoConnectionString(connectionDetails.connectionString);
        return { host: parsed.hostname, port: parsed.port };
      }

      return connectionDetails as { host: string; port: number };
    })();

    const gatewayConnectionDetails = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId,
      duration,
      sessionId: session.id,
      resourceType: resource.resourceType as PamResource,
      host,
      port,
      actorMetadata: {
        id: actor.id,
        type: actor.type,
        name: user.email ?? ""
      }
    });

    if (!gatewayConnectionDetails) {
      throw new NotFoundError({ message: `Gateway connection details for gateway '${gatewayId}' not found.` });
    }

    let metadata;

    switch (resourceType) {
      case PamResource.Postgres:
      case PamResource.MySQL:
      case PamResource.MsSQL:
      case PamResource.MongoDB:
        {
          const connectionCredentials = (await decryptResourceConnectionDetails({
            encryptedConnectionDetails: resource.encryptedConnectionDetails,
            kmsService,
            projectId
          })) as TSqlResourceConnectionDetails;

          const credentials = (await decryptAccountCredentials({
            encryptedCredentials: account.encryptedCredentials,
            kmsService,
            projectId
          })) as TSqlAccountCredentials;

          metadata = {
            username: credentials.username,
            database: connectionCredentials.database,
            accountName: account.name,
            resourceName: resource.name
          };
        }
        break;
      case PamResource.Redis:
        {
          const credentials = (await decryptAccountCredentials({
            encryptedCredentials: account.encryptedCredentials,
            kmsService,
            projectId
          })) as TRedisAccountCredentials;

          metadata = {
            username: credentials.username,
            accountName: account.name,
            resourceName: resource.name
          };
        }
        break;
      case PamResource.SSH:
        {
          const credentials = (await decryptAccountCredentials({
            encryptedCredentials: account.encryptedCredentials,
            kmsService,
            projectId
          })) as TSSHAccountCredentials;

          metadata = {
            username: credentials.username
          };
        }
        break;
      case PamResource.Kubernetes:
        metadata = {
          resourceName: resource.name,
          accountName: account.name
        };
        break;
      default:
        break;
    }

    return {
      sessionId: session.id,
      resourceType,
      relayClientCertificate: gatewayConnectionDetails.relay.clientCertificate,
      relayClientPrivateKey: gatewayConnectionDetails.relay.clientPrivateKey,
      relayServerCertificateChain: gatewayConnectionDetails.relay.serverCertificateChain,
      gatewayClientCertificate: gatewayConnectionDetails.gateway.clientCertificate,
      gatewayClientPrivateKey: gatewayConnectionDetails.gateway.clientPrivateKey,
      gatewayServerCertificateChain: gatewayConnectionDetails.gateway.serverCertificateChain,
      relayHost: gatewayConnectionDetails.relayHost,
      projectId,
      account,
      metadata
    };
  };

  const getSessionCredentials = async (sessionId: string, actor: OrgServiceActor) => {
    // To be hit by gateways only
    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only gateways can perform this action" });
    }

    const session = await pamSessionDAL.findById(sessionId);
    if (!session) throw new NotFoundError({ message: `Session with ID '${sessionId}' not found` });

    const project = await projectDAL.findById(session.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${session.projectId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: project.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

    if (!session.accountId) throw new NotFoundError({ message: "Session is missing accountId column" });

    // Verify that the session has not ended
    if (session.endedAt || (session.expiresAt && session.expiresAt < new Date())) {
      throw new BadRequestError({ message: "Session has ended or expired" });
    }

    const account = await pamAccountDAL.findById(session.accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${session.accountId}' not found` });

    const resource = await pamResourceDAL.findById(account.resourceId!);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });

    if (resource.gatewayId && resource.gatewayIdentityId !== actor.id) {
      throw new ForbiddenRequestError({
        message: "Identity does not have access to fetch the PAM session credentials"
      });
    }

    const decryptedAccount = await decryptAccount(account, session.projectId, kmsService);

    const decryptedResource = await decryptResource(resource, session.projectId, kmsService);

    let sessionStarted = false;

    // Mark session as started
    if (session.status === PamSessionStatus.Starting) {
      await pamSessionDAL.updateById(sessionId, {
        status: PamSessionStatus.Active,
        startedAt: new Date()
      });
      sessionStarted = true;
    }

    // Handle SSH certificate-based authentication
    if (decryptedResource.resourceType === PamResource.SSH) {
      const accountCredentials = decryptedAccount.credentials as TSSHAccountCredentials;

      if (accountCredentials.authMethod === SSHAuthMethod.Certificate) {
        if (!resource.encryptedResourceMetadata) {
          throw new BadRequestError({
            message: "SSH resource does not have a CA configured for certificate-based authentication"
          });
        }

        const metadata = await decryptResourceMetadata<TSSHResourceInternalMetadata>({
          encryptedMetadata: resource.encryptedResourceMetadata,
          projectId: session.projectId,
          kmsService
        });

        const { caPrivateKey, caKeyAlgorithm } = metadata;

        // Generate a new key pair for the user
        const keyAlgorithm = (caKeyAlgorithm as SshCertKeyAlgorithm) || SshCertKeyAlgorithm.ED25519;
        const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

        // Calculate TTL from session expiry
        const ttlSeconds = Math.max(Math.floor((session.expiresAt.getTime() - Date.now()) / 1000), 60);

        // Sign the public key with the CA to create a certificate
        const { signedPublicKey } = await createSshCert({
          caPrivateKey,
          clientPublicKey: publicKey,
          keyId: `pam-session-${session.id}`,
          principals: [accountCredentials.username],
          requestedTtl: `${ttlSeconds}s`,
          certType: SshCertType.USER
        });

        return {
          credentials: {
            ...decryptedResource.connectionDetails,
            authMethod: SSHAuthMethod.Certificate,
            username: accountCredentials.username,
            privateKey,
            certificate: signedPublicKey
          },
          projectId: project.id,
          account,
          sessionStarted
        };
      }
    }

    return {
      credentials: {
        ...decryptedResource.connectionDetails,
        ...decryptedAccount.credentials
      },
      projectId: project.id,
      account,
      sessionStarted
    };
  };

  // Find accounts due for rotation using rule-based matching
  const findAccountsDueForRotation = async () => {
    // Get only resources with rotation credentials configured
    const resourcesWithRotationCreds = await pamResourceDAL.find({
      $notNull: ["encryptedRotationAccountCredentials"]
    });
    if (!resourcesWithRotationCreds.length) return [];

    const resourceIds = resourcesWithRotationCreds.map((r) => r.id);

    const allRules = await pamResourceRotationRulesDAL.findByResourceIds(resourceIds);
    if (!allRules.length) return [];

    // Group rules by resource, compute minimum interval for DB pre-filter
    const rulesByResource: Record<string, typeof allRules> = {};
    let minIntervalSeconds = Infinity;
    for (const rule of allRules) {
      if (!rulesByResource[rule.resourceId]) rulesByResource[rule.resourceId] = [];
      rulesByResource[rule.resourceId].push(rule);
      if (rule.enabled && rule.intervalSeconds) {
        minIntervalSeconds = Math.min(minIntervalSeconds, rule.intervalSeconds);
      }
    }

    if (minIntervalSeconds === Infinity) return [];

    const resourceIdsWithRules = Object.keys(rulesByResource);
    const accounts = await pamAccountDAL.findRotationCandidates({
      resourceIds: resourceIdsWithRules,
      minIntervalSeconds
    });

    const now = Date.now();
    const dueAccounts: TPamAccounts[] = [];

    for (const account of accounts) {
      const rules = rulesByResource[account.resourceId!];
      // eslint-disable-next-line no-continue
      if (!rules) continue;

      // Find first matching rule by priority (already sorted by DAL)
      const matchedRule = rules.find((rule) => picomatch.isMatch(account.name, rule.namePattern));

      // eslint-disable-next-line no-continue
      if (!matchedRule || !matchedRule.enabled || !matchedRule.intervalSeconds) continue;

      // Check if interval has elapsed
      const lastRotated = account.lastRotatedAt
        ? new Date(account.lastRotatedAt).getTime()
        : account.createdAt.getTime();

      const nextRotationAt = lastRotated + matchedRule.intervalSeconds * 1000;

      // eslint-disable-next-line no-continue
      if (nextRotationAt > now) continue;

      dueAccounts.push(account);
    }

    return dueAccounts;
  };

  const rotateAccount = async (account: TPamAccounts) => {
    let logResourceType = "unknown";
    try {
      // Atomically claim rotation lock, only proceeds if not already rotating
      const claimed = await pamAccountDAL.transaction(async (tx) => {
        const updated = await tx(TableName.PamAccount)
          .where({ id: account.id })
          .where((qb) => {
            void qb.whereNull("rotationStatus").orWhereNot("rotationStatus", PamAccountRotationStatus.Rotating);
          })
          .update({ rotationStatus: PamAccountRotationStatus.Rotating })
          .returning("*");
        return updated[0];
      });
      if (!claimed) return;

      // Read resource
      const resource = await pamResourceDAL.findById(account.resourceId!);
      if (!resource || !resource.encryptedRotationAccountCredentials) {
        logger.warn(
          `[Rotation] Resource or rotation credentials missing for account [accountId=${account.id}], releasing lock`
        );
        await pamAccountDAL.updateById(account.id, { rotationStatus: PamAccountRotationStatus.Failed });
        return;
      }
      logResourceType = resource.resourceType;

      const { connectionDetails, rotationAccountCredentials, gatewayId, resourceType } = await decryptResource(
        resource,
        account.projectId,
        kmsService
      );
      if (!rotationAccountCredentials) {
        logger.warn(
          `[Rotation] Decrypted rotation credentials missing for account [accountId=${account.id}], releasing lock`
        );
        await pamAccountDAL.updateById(account.id, { rotationStatus: PamAccountRotationStatus.Failed });
        return;
      }

      // Perform rotation
      const accountCredentials = await decryptAccountCredentials({
        encryptedCredentials: account.encryptedCredentials,
        projectId: account.projectId,
        kmsService
      });

      // Prevent the rotation account from rotating its own password
      const rotationUsername = (rotationAccountCredentials as { username?: string })?.username;
      const accountUsername = (accountCredentials as { username?: string })?.username;
      if (rotationUsername && accountUsername && rotationUsername.toLowerCase() === accountUsername.toLowerCase()) {
        logger.warn(
          `[Rotation] Skipping rotation for account [accountId=${account.id}] — account is the rotation account itself`
        );
        const errorMsg = "This account cannot be rotated because it is used as the rotation credentials";
        try {
          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: account.projectId
          });
          const { cipherTextBlob: encryptedMessage } = encryptor({ plainText: Buffer.from(errorMsg) });
          await pamAccountDAL.updateById(account.id, {
            rotationStatus: PamAccountRotationStatus.Failed,
            encryptedLastRotationMessage: encryptedMessage
          });
        } catch {
          await pamAccountDAL.updateById(account.id, {
            rotationStatus: PamAccountRotationStatus.Failed
          });
        }
        return;
      }

      const factory = PAM_RESOURCE_FACTORY_MAP[resourceType as PamResource](
        resourceType as PamResource,
        connectionDetails,
        gatewayId,
        gatewayV2Service,
        account.projectId
      );
      const newCredentials = await factory.rotateAccountCredentials(rotationAccountCredentials, accountCredentials);

      // Save result
      const encryptedCredentials = await encryptAccountCredentials({
        credentials: newCredentials,
        projectId: account.projectId,
        kmsService
      });

      await pamAccountDAL.updateById(account.id, {
        encryptedCredentials,
        lastRotatedAt: new Date(),
        rotationStatus: PamAccountRotationStatus.Success,
        encryptedLastRotationMessage: null
      });

      await auditLogService.createAuditLog({
        projectId: account.projectId,
        actor: {
          type: ActorType.PLATFORM,
          metadata: {}
        },
        event: {
          type: EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION,
          metadata: {
            accountId: account.id,
            accountName: account.name,
            resourceId: resource.id,
            resourceType: logResourceType
          }
        }
      });

      // Run post-rotate hook (e.g. dependency sync)
      if (factory.postRotate) {
        try {
          await factory.postRotate(
            account.id,
            newCredentials,
            account.projectId,
            { pamAccountDependenciesDAL, pamResourceDAL, kmsService },
            rotationAccountCredentials
          );
        } catch (postRotateError) {
          // Password was rotated but dependency sync failed, mark as partial success
          const postRotateMsg = `Password rotated successfully, but dependency sync failed: ${postRotateError instanceof Error ? postRotateError.message : String(postRotateError)}`;
          logger.error(postRotateError, `Post-rotation hook failed for account [accountId=${account.id}]`);
          try {
            const { encryptor: postRotateEncryptor } = await kmsService.createCipherPairWithDataKey({
              type: KmsDataKey.SecretManager,
              projectId: account.projectId
            });
            const { cipherTextBlob: encryptedPostRotateMsg } = postRotateEncryptor({
              plainText: Buffer.from(postRotateMsg)
            });
            await pamAccountDAL.updateById(account.id, {
              rotationStatus: PamAccountRotationStatus.PartialSuccess,
              encryptedLastRotationMessage: encryptedPostRotateMsg
            });
          } catch (encryptErr) {
            logger.error(encryptErr, `Failed to store post-rotation warning for account [accountId=${account.id}]`);
            await pamAccountDAL.updateById(account.id, {
              rotationStatus: PamAccountRotationStatus.PartialSuccess
            });
          }
        }
      }
    } catch (error) {
      logger.error(error, `Failed to rotate credentials for account [accountId=${account.id}]`);

      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

      try {
        const { encryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: account.projectId
        });

        const { cipherTextBlob: encryptedMessage } = encryptor({
          plainText: Buffer.from(errorMessage)
        });

        await pamAccountDAL.updateById(account.id, {
          rotationStatus: PamAccountRotationStatus.Failed,
          encryptedLastRotationMessage: encryptedMessage
        });
      } catch (encryptErr) {
        logger.error(encryptErr, `Failed to encrypt rotation error for account [accountId=${account.id}]`);
        await pamAccountDAL.updateById(account.id, {
          rotationStatus: PamAccountRotationStatus.Failed
        });
      }

      try {
        await auditLogService.createAuditLog({
          projectId: account.projectId,
          actor: {
            type: ActorType.PLATFORM,
            metadata: {}
          },
          event: {
            type: EventType.PAM_ACCOUNT_CREDENTIAL_ROTATION_FAILED,
            metadata: {
              accountId: account.id,
              accountName: account.name,
              resourceId: account.resourceId!,
              resourceType: logResourceType,
              errorMessage
            }
          }
        });
      } catch (auditErr) {
        logger.error(auditErr, `Failed to create audit log for rotation failure [accountId=${account.id}]`);
      }
    }
  };

  const rotateAllDueAccounts = async () => {
    const accounts = await findAccountsDueForRotation();

    for (let i = 0; i < accounts.length; i += ROTATION_CONCURRENCY_LIMIT) {
      const batch = accounts.slice(i, i + ROTATION_CONCURRENCY_LIMIT);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(batch.map(rotateAccount));
    }
  };

  const triggerManualRotation = async (accountId: string, actor: OrgServiceActor) => {
    const accountWithParent = await pamAccountDAL.findByIdWithParentDetails(accountId);
    if (!accountWithParent) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    if (!accountWithParent.resource)
      throw new NotFoundError({ message: `Resource not found for account '${accountId}'` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: accountWithParent.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.TriggerRotation,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: accountWithParent.resource.name,
        accountName: accountWithParent.name,
        resourceType: accountWithParent.resource.resourceType
      })
    );

    if (!accountWithParent.resource.encryptedRotationAccountCredentials) {
      throw new BadRequestError({ message: "Rotation credentials are not configured on this resource" });
    }

    // Immediate check. There's an actual atomic lock in rotateAccount
    if (accountWithParent.rotationStatus === PamAccountRotationStatus.Rotating) {
      throw new BadRequestError({ message: "Account is already being rotated" });
    }

    await rotateAccount(accountWithParent);

    const updatedAccountWithParent = await pamAccountDAL.findByIdWithParentDetails(accountId);
    if (!updatedAccountWithParent) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    if (!updatedAccountWithParent.resource)
      throw new NotFoundError({ message: `Resource not found for account '${accountId}'` });

    const metadataByAccountId = await pamAccountDAL.findMetadataByAccountIds([updatedAccountWithParent.id]);
    const accountMetadata = metadataByAccountId[updatedAccountWithParent.id] || [];

    const decryptedAccount = await decryptAccount(
      updatedAccountWithParent,
      updatedAccountWithParent.projectId,
      kmsService
    );

    return {
      ...decryptedAccount,
      metadata: accountMetadata,
      parentType: updatedAccountWithParent.resource.resourceType,
      resource: {
        id: updatedAccountWithParent.resource.id,
        name: updatedAccountWithParent.resource.name,
        resourceType: updatedAccountWithParent.resource.resourceType,
        rotationCredentialsConfigured: !!updatedAccountWithParent.resource.encryptedRotationAccountCredentials
      },
      domain: null
    };
  };

  const viewCredentials = async ({
    accountId,
    mfaSessionId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TViewAccountCredentialsDTO) => {
    const accountWithParent = await pamAccountDAL.findByIdWithParentDetails(accountId);
    if (!accountWithParent) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    if (!accountWithParent.resource && !accountWithParent.domain)
      throw new NotFoundError({ message: `Parent not found for account '${accountId}'` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accountWithParent.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const metadataByAccountId = await pamAccountDAL.findMetadataByAccountIds([accountWithParent.id]);
    const accountMetadata = metadataByAccountId[accountWithParent.id] || [];

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.ReadCredentials,
      subject(ProjectPermissionSub.PamAccounts, {
        accountName: accountWithParent.name,
        ...(accountWithParent.resource && {
          resourceName: accountWithParent.resource.name,
          resourceType: accountWithParent.resource.resourceType
        }),
        ...(accountWithParent.domain && {
          domainName: accountWithParent.domain.name,
          domainType: accountWithParent.domain.domainType
        }),
        metadata: accountMetadata
      })
    );

    const parentType = accountWithParent.resource?.resourceType || accountWithParent.domain?.domainType || "";

    const credentials = await decryptAccountCredentials({
      encryptedCredentials: accountWithParent.encryptedCredentials,
      kmsService,
      projectId: accountWithParent.projectId
    });

    if (!hasSensitiveCredentials(parentType, credentials)) {
      throw new BadRequestError({ message: "This account has no sensitive credentials to view" });
    }

    if (!mfaSessionId && accountWithParent.requireMfa) {
      const project = await projectDAL.findById(accountWithParent.projectId);
      if (!project) throw new NotFoundError({ message: `Project with ID '${accountWithParent.projectId}' not found` });

      const actorUser = await userDAL.findById(actorId);
      if (!actorUser) throw new NotFoundError({ message: `User with ID '${actorId}' not found` });

      const org = await orgDAL.findOrgById(project.orgId);
      if (!org) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

      const orgMfaMethod = org.enforceMfa ? (org.selectedMfaMethod as MfaMethod | null) : undefined;
      const userMfaMethod = actorUser.isMfaEnabled ? (actorUser.selectedMfaMethod as MfaMethod | null) : undefined;
      const mfaMethod = (orgMfaMethod ?? userMfaMethod ?? MfaMethod.EMAIL) as MfaMethod;

      const newMfaSessionId = await mfaSessionService.createMfaSession(actorUser.id, accountWithParent.id, mfaMethod);

      if (mfaMethod === MfaMethod.EMAIL && actorUser.email) {
        await mfaSessionService.sendMfaCode(actorUser.id, actorUser.email);
      }

      throw new BadRequestError({
        message: "MFA verification required to view PAM account credentials",
        name: "SESSION_MFA_REQUIRED",
        details: {
          mfaSessionId: newMfaSessionId,
          mfaMethod
        }
      });
    }

    if (mfaSessionId && accountWithParent.requireMfa) {
      const mfaSession = await mfaSessionService.getMfaSession(mfaSessionId);
      if (!mfaSession) {
        throw new BadRequestError({ message: "MFA session not found or expired" });
      }

      if (mfaSession.userId !== actorId) {
        throw new BadRequestError({ message: "MFA session does not belong to current user" });
      }

      if (mfaSession.resourceId !== accountWithParent.id) {
        throw new BadRequestError({ message: "MFA session is for a different account" });
      }

      if (mfaSession.status !== MfaSessionStatus.ACTIVE) {
        throw new BadRequestError({ message: "MFA session is not active. Please complete MFA verification first." });
      }

      await mfaSessionService.deleteMfaSession(mfaSessionId);
    }

    return {
      credentials,
      parentType,
      accountId: accountWithParent.id,
      accountName: accountWithParent.name,
      projectId: accountWithParent.projectId,
      resource: accountWithParent.resource
        ? {
            id: accountWithParent.resource.id,
            name: accountWithParent.resource.name,
            resourceType: accountWithParent.resource.resourceType
          }
        : null,
      domain: accountWithParent.domain
        ? {
            id: accountWithParent.domain.id,
            name: accountWithParent.domain.name,
            domainType: accountWithParent.domain.domainType
          }
        : null
    };
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    getById,
    access,
    viewCredentials,
    getSessionCredentials,
    rotateAllDueAccounts,
    triggerManualRotation
  };
};
