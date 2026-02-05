import path from "node:path";

import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TPamAccounts, TPamFolders, TPamResources } from "@app/db/schemas";
import {
  extractAwsAccountIdFromArn,
  generateConsoleFederationUrl,
  TAwsIamAccountCredentials
} from "@app/ee/services/pam-resource/aws-iam";
import { PAM_RESOURCE_FACTORY_MAP } from "@app/ee/services/pam-resource/pam-resource-factory";
import {
  decryptResource,
  decryptResourceConnectionDetails,
  decryptResourceMetadata
} from "@app/ee/services/pam-resource/pam-resource-fns";
import { SSHAuthMethod } from "@app/ee/services/pam-resource/ssh/ssh-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
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
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";
import { TRedisAccountCredentials } from "../pam-resource/redis/redis-resource-types";
import { TSqlAccountCredentials, TSqlResourceConnectionDetails } from "../pam-resource/shared/sql/sql-resource-types";
import { TSSHAccountCredentials, TSSHResourceMetadata } from "../pam-resource/ssh/ssh-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { PamAccountView } from "./pam-account-enums";
import { decryptAccount, decryptAccountCredentials, encryptAccountCredentials } from "./pam-account-fns";
import {
  TAccessAccountDTO,
  TCreateAccountDTO,
  TGetAccountByIdDTO,
  TListAccountsDTO,
  TUpdateAccountDTO
} from "./pam-account-types";

type TPamAccountServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  pamSessionDAL: TPamSessionDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamFolderDAL: TPamFolderDALFactory;
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
};

export type TPamAccountServiceFactory = ReturnType<typeof pamAccountServiceFactory>;

const ROTATION_CONCURRENCY_LIMIT = 10;

export const pamAccountServiceFactory = ({
  pamResourceDAL,
  pamSessionDAL,
  pamAccountDAL,
  mfaSessionService,
  pamFolderDAL,
  projectDAL,
  orgDAL,
  userDAL,
  permissionService,
  kmsService,
  gatewayV2Service,
  auditLogService,
  approvalPolicyDAL,
  approvalRequestGrantsDAL,
  pamSessionExpirationService
}: TPamAccountServiceFactoryDep) => {
  const create = async (
    {
      credentials,
      resourceId,
      name,
      description,
      folderId,
      rotationEnabled,
      rotationIntervalSeconds,
      requireMfa,
      metadata
    }: TCreateAccountDTO,
    actor: OrgServiceActor
  ) => {
    if (rotationEnabled && (rotationIntervalSeconds === undefined || rotationIntervalSeconds === null)) {
      throw new BadRequestError({
        message: "Rotation interval must be defined when rotation is enabled."
      });
    }

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

    if (!resource.encryptedRotationAccountCredentials && rotationEnabled) {
      throw new NotFoundError({ message: "Rotation credentials are not configured for this account's resource" });
    }

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId,
      projectId: resource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Create,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: name,
        accountPath
      })
    );

    const connectionDetails = await decryptResourceConnectionDetails({
      projectId: resource.projectId,
      encryptedConnectionDetails: resource.encryptedConnectionDetails,
      kmsService
    });

    // Decrypt resource metadata if available
    const resourceMetadata = resource.encryptedResourceMetadata
      ? await decryptResourceMetadata({
          encryptedMetadata: resource.encryptedResourceMetadata,
          projectId: resource.projectId,
          kmsService
        })
      : undefined;

    const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
      resource.resourceType as PamResource,
      connectionDetails,
      resource.gatewayId,
      gatewayV2Service,
      resource.projectId,
      resourceMetadata
    );
    const validatedCredentials = await factory.validateAccountCredentials(credentials);

    const encryptedCredentials = await encryptAccountCredentials({
      credentials: validatedCredentials,
      projectId: resource.projectId,
      kmsService
    });

    try {
      const account = await pamAccountDAL.create({
        projectId: resource.projectId,
        resourceId: resource.id,
        encryptedCredentials,
        name,
        description,
        folderId,
        rotationEnabled,
        rotationIntervalSeconds,
        requireMfa,
        metadata: metadata ?? null
      });

      return {
        ...(await decryptAccount(account, resource.projectId, kmsService)),
        resource: {
          id: resource.id,
          name: resource.name,
          resourceType: resource.resourceType,
          rotationCredentialsConfigured: !!resource.encryptedRotationAccountCredentials
        }
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Account with name '${name}' already exists for this path`
        });
      }

      throw err;
    }
  };

  const updateById = async (
    {
      accountId,
      credentials,
      description,
      name,
      rotationEnabled,
      rotationIntervalSeconds,
      requireMfa,
      metadata
    }: TUpdateAccountDTO,
    actor: OrgServiceActor
  ) => {
    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findById(account.resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Edit,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

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

    if (rotationEnabled !== undefined) {
      if (!resource.encryptedRotationAccountCredentials && rotationEnabled) {
        throw new NotFoundError({ message: "Rotation credentials are not configured for this account's resource" });
      }
      updateDoc.rotationEnabled = rotationEnabled;
    }

    if (rotationIntervalSeconds !== undefined) {
      updateDoc.rotationIntervalSeconds = rotationIntervalSeconds;
    }

    if (metadata !== undefined) {
      updateDoc.metadata = metadata;
    }

    if (credentials !== undefined) {
      const connectionDetails = await decryptResourceConnectionDetails({
        projectId: account.projectId,
        encryptedConnectionDetails: resource.encryptedConnectionDetails,
        kmsService
      });

      // Decrypt resource metadata if available
      const resourceMetadata = resource.encryptedResourceMetadata
        ? await decryptResourceMetadata({
            encryptedMetadata: resource.encryptedResourceMetadata,
            projectId: account.projectId,
            kmsService
          })
        : undefined;

      const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
        resource.resourceType as PamResource,
        connectionDetails,
        resource.gatewayId,
        gatewayV2Service,
        account.projectId,
        resourceMetadata
      );

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
    if (Object.keys(updateDoc).length === 0) {
      return decryptAccount(account, account.projectId, kmsService);
    }

    try {
      const updatedAccount = await pamAccountDAL.updateById(accountId, updateDoc);

      return {
        ...(await decryptAccount(updatedAccount, account.projectId, kmsService)),
        resource: {
          id: resource.id,
          name: resource.name,
          resourceType: resource.resourceType,
          rotationCredentialsConfigured: !!resource.encryptedRotationAccountCredentials
        }
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `Account with name '${name}' already exists for this path`
        });
      }

      throw err;
    }
  };

  const deleteById = async (id: string, actor: OrgServiceActor) => {
    const account = await pamAccountDAL.findById(id);
    if (!account) throw new NotFoundError({ message: `Account with ID '${id}' not found` });

    const resource = await pamResourceDAL.findById(account.resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Delete,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const deletedAccount = await pamAccountDAL.deleteById(id);

    return {
      ...(await decryptAccount(deletedAccount, account.projectId, kmsService)),
      resource: {
        id: resource.id,
        name: resource.name,
        resourceType: resource.resourceType,
        rotationCredentialsConfigured: !!resource.encryptedRotationAccountCredentials
      }
    };
  };

  const list = async ({
    projectId,
    accountPath,
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

    const canReadFolders = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.PamFolders);

    const folder = accountPath === "/" ? null : await pamFolderDAL.findByPath(projectId, accountPath);
    if (accountPath !== "/" && !folder) {
      return { accounts: [], folders: [], totalCount: 0, folderPaths: {} };
    }
    const folderId = folder?.id;

    let totalFolderCount = 0;
    if (canReadFolders && accountView === PamAccountView.Nested) {
      const { totalCount } = await pamFolderDAL.findByProjectId({
        projectId,
        parentId: folderId,
        search: params.search
      });
      totalFolderCount = totalCount;
    }

    let folders: TPamFolders[] = [];
    if (canReadFolders && accountView === PamAccountView.Nested && offset < totalFolderCount) {
      const folderLimit = Math.min(limit, totalFolderCount - offset);
      const { folders: foldersResp } = await pamFolderDAL.findByProjectId({
        projectId,
        parentId: folderId,
        limit: folderLimit,
        offset,
        search: params.search,
        orderBy: params.orderBy,
        orderDirection: params.orderDirection
      });

      folders = foldersResp;
    }

    let accountsWithResourceDetails: Awaited<
      ReturnType<typeof pamAccountDAL.findByProjectIdWithResourceDetails>
    >["accounts"] = [];
    let totalAccountCount = 0;

    const accountsToFetch = limit - folders.length;
    if (accountsToFetch > 0) {
      const accountOffset = Math.max(0, offset - totalFolderCount);
      const { accounts, totalCount } = await pamAccountDAL.findByProjectIdWithResourceDetails({
        projectId,
        folderId,
        accountView,
        offset: accountOffset,
        limit: accountsToFetch,
        search: params.search,
        orderBy: params.orderBy,
        orderDirection: params.orderDirection,
        filterResourceIds: params.filterResourceIds
      });
      accountsWithResourceDetails = accounts;
      totalAccountCount = totalCount;
    } else {
      // if no accounts are to be fetched for the current page, we still need the total count for pagination
      const { totalCount } = await pamAccountDAL.findByProjectIdWithResourceDetails({
        projectId,
        folderId,
        accountView,
        search: params.search,
        filterResourceIds: params.filterResourceIds
      });
      totalAccountCount = totalCount;
    }

    const totalCount = totalFolderCount + totalAccountCount;

    const decryptedAndPermittedAccounts: Array<
      Omit<TPamAccounts, "encryptedCredentials" | "encryptedLastRotationMessage"> & {
        resource: Pick<TPamResources, "id" | "name" | "resourceType"> & { rotationCredentialsConfigured: boolean };
        credentials: TPamAccountCredentials;
        lastRotationMessage: string | null;
      }
    > = [];

    for await (const account of accountsWithResourceDetails) {
      // Check permission for each individual account
      if (
        permission.can(
          ProjectPermissionPamAccountActions.Read,
          subject(ProjectPermissionSub.PamAccounts, {
            resourceName: account.resource.name,
            accountName: account.name,
            accountPath
          })
        )
      ) {
        // Decrypt the account only if the user has permission to read it
        const decryptedAccount = await decryptAccount(account, account.projectId, kmsService);

        decryptedAndPermittedAccounts.push({
          ...decryptedAccount,
          resource: {
            id: account.resource.id,
            name: account.resource.name,
            resourceType: account.resource.resourceType,
            rotationCredentialsConfigured: !!account.resource.encryptedRotationAccountCredentials
          }
        });
      }
    }

    const folderPaths: Record<string, string> = {};
    const accountFolderIds = [
      ...new Set(decryptedAndPermittedAccounts.flatMap((a) => (a.folderId ? [a.folderId] : [])))
    ];

    await Promise.all(
      accountFolderIds.map(async (fId) => {
        folderPaths[fId] = await getFullPamFolderPath({
          pamFolderDAL,
          folderId: fId,
          projectId
        });
      })
    );

    return {
      accounts: decryptedAndPermittedAccounts,
      folders,
      totalCount,
      folderId,
      folderPaths
    };
  };

  const getById = async ({ accountId, actor, actorId, actorAuthMethod, actorOrgId }: TGetAccountByIdDTO) => {
    const accountWithResource = await pamAccountDAL.findByIdWithResourceDetails(accountId);
    if (!accountWithResource) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accountWithResource.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: accountWithResource.folderId,
      projectId: accountWithResource.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Read,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: accountWithResource.resource.name,
        accountName: accountWithResource.name,
        accountPath
      })
    );

    const decryptedAccount = await decryptAccount(accountWithResource, accountWithResource.projectId, kmsService);

    return {
      ...decryptedAccount,
      resource: {
        id: accountWithResource.resource.id,
        name: accountWithResource.resource.name,
        resourceType: accountWithResource.resource.resourceType,
        rotationCredentialsConfigured: !!accountWithResource.resource.encryptedRotationAccountCredentials
      }
    };
  };

  const access = async (
    {
      accountPath,
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
    let account;
    let resource;
    let folderPath = "/";

    // New approach: Use resourceName + accountName to find the account directly
    if (inputResourceName && inputAccountName) {
      // Find resource by name
      resource = await pamResourceDAL.findOne({ projectId, name: inputResourceName });
      if (!resource) {
        throw new NotFoundError({ message: `Resource with name '${inputResourceName}' not found` });
      }

      // Find account by name within the resource
      account = await pamAccountDAL.findOne({
        projectId,
        resourceId: resource.id,
        name: inputAccountName
      });

      if (!account) {
        throw new NotFoundError({
          message: `Account with name '${inputAccountName}' not found for resource '${inputResourceName}'`
        });
      }

      // Get folder path if account has a folder
      if (account.folderId) {
        folderPath = await getFullPamFolderPath({
          pamFolderDAL,
          folderId: account.folderId,
          projectId
        });
      }
    }
    // Legacy approach: Use accountPath to find the account
    else if (accountPath) {
      const pathSegments: string[] = accountPath.split("/").filter(Boolean);
      if (pathSegments.length === 0) {
        throw new BadRequestError({ message: "Invalid accountPath. Path must contain at least the account name." });
      }

      const accountName: string = pathSegments[pathSegments.length - 1] ?? "";
      const folderPathSegments: string[] = pathSegments.slice(0, -1);

      folderPath = folderPathSegments.length > 0 ? `/${folderPathSegments.join("/")}` : "/";

      let folderId: string | null = null;
      if (folderPath !== "/") {
        const folder = await pamFolderDAL.findByPath(projectId, folderPath);
        if (!folder) {
          throw new NotFoundError({ message: `Folder at path '${folderPath}' not found` });
        }
        folderId = folder.id;
      }

      account = await pamAccountDAL.findOne({
        projectId,
        folderId,
        name: accountName
      });

      if (!account) {
        throw new NotFoundError({
          message: `Account with name '${accountName}' not found at path '${accountPath}'`
        });
      }

      resource = await pamResourceDAL.findById(account.resourceId);
      if (!resource) throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });
    } else {
      throw new BadRequestError({
        message: "Either (resourceName and accountName) or accountPath must be provided"
      });
    }

    const fac = APPROVAL_POLICY_FACTORY_MAP[ApprovalPolicyType.PamAccess](ApprovalPolicyType.PamAccess);

    const inputs = {
      resourceId: resource.id,
      accountPath: path.join(folderPath, account.name),
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

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionPamAccountActions.Access,
        subject(ProjectPermissionSub.PamAccounts, {
          resourceName: resource.name,
          accountName: account.name,
          accountPath: folderPath
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

    const { host, port } =
      resourceType !== PamResource.Kubernetes
        ? connectionDetails
        : (() => {
            const url = new URL(connectionDetails.url);
            let portNumber: number | undefined;
            if (url.port) {
              portNumber = Number(url.port);
            } else {
              portNumber = url.protocol === "https:" ? 443 : 80;
            }
            return {
              host: url.hostname,
              port: portNumber
            };
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
            accountPath: folderPath
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
            accountPath: folderPath
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
          accountName: account.name,
          accountPath
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

    const resource = await pamResourceDAL.findById(account.resourceId);
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

        const metadata = await decryptResourceMetadata<TSSHResourceMetadata>({
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

  const rotateAllDueAccounts = async () => {
    const accounts = await pamAccountDAL.findAccountsDueForRotation();

    for (let i = 0; i < accounts.length; i += ROTATION_CONCURRENCY_LIMIT) {
      const batch = accounts.slice(i, i + ROTATION_CONCURRENCY_LIMIT);

      const rotationPromises = batch.map(async (account) => {
        let logResourceType = "unknown";
        try {
          await pamAccountDAL.transaction(async (tx) => {
            const resource = await pamResourceDAL.findById(account.resourceId, tx);
            if (!resource || !resource.encryptedRotationAccountCredentials) return;
            logResourceType = resource.resourceType;

            const { connectionDetails, rotationAccountCredentials, gatewayId, resourceType } = await decryptResource(
              resource,
              account.projectId,
              kmsService
            );

            if (!rotationAccountCredentials) return;

            const accountCredentials = await decryptAccountCredentials({
              encryptedCredentials: account.encryptedCredentials,
              projectId: account.projectId,
              kmsService
            });

            const factory = PAM_RESOURCE_FACTORY_MAP[resourceType as PamResource](
              resourceType as PamResource,
              connectionDetails,
              gatewayId,
              gatewayV2Service,
              account.projectId
            );

            const newCredentials = await factory.rotateAccountCredentials(
              rotationAccountCredentials,
              accountCredentials
            );

            const encryptedCredentials = await encryptAccountCredentials({
              credentials: newCredentials,
              projectId: account.projectId,
              kmsService
            });

            await pamAccountDAL.updateById(
              account.id,
              {
                encryptedCredentials,
                lastRotatedAt: new Date(),
                rotationStatus: "success",
                encryptedLastRotationMessage: null
              },
              tx
            );

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
          });
        } catch (error) {
          logger.error(error, `Failed to rotate credentials for account [accountId=${account.id}]`);

          const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";

          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: account.projectId
          });

          const { cipherTextBlob: encryptedMessage } = encryptor({
            plainText: Buffer.from(errorMessage)
          });

          await pamAccountDAL.updateById(account.id, {
            rotationStatus: "failed",
            encryptedLastRotationMessage: encryptedMessage
          });

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
                resourceId: account.resourceId,
                resourceType: logResourceType,
                errorMessage
              }
            }
          });
        }
      });

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(rotationPromises);
    }
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    getById,
    access,
    getSessionCredentials,
    rotateAllDueAccounts
  };
};
