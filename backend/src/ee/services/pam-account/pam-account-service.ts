import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TPamAccounts, TPamFolders, TPamResources } from "@app/db/schemas";
import { PAM_RESOURCE_FACTORY_MAP } from "@app/ee/services/pam-resource/pam-resource-factory";
import { decryptResource, decryptResourceConnectionDetails } from "@app/ee/services/pam-resource/pam-resource-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { MfaSessionStatus, TMfaSession } from "@app/services/mfa-session/mfa-session-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";
import { TSqlResourceConnectionDetails } from "../pam-resource/shared/sql/sql-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { PamAccountView } from "./pam-account-enums";
import { decryptAccount, decryptAccountCredentials, encryptAccountCredentials } from "./pam-account-fns";
import { TAccessAccountDTO, TCreateAccountDTO, TListAccountsDTO, TUpdateAccountDTO } from "./pam-account-types";

type TPamAccountServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  pamSessionDAL: TPamSessionDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamFolderDAL: TPamFolderDALFactory;
  projectDAL: TProjectDALFactory;
  orgDAL: TOrgDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getPAMConnectionDetails" | "getPlatformConnectionDetailsByGatewayId"
  >;
  userDAL: TUserDALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
};
export type TPamAccountServiceFactory = ReturnType<typeof pamAccountServiceFactory>;

const ROTATION_CONCURRENCY_LIMIT = 10;

export const pamAccountServiceFactory = ({
  pamResourceDAL,
  pamSessionDAL,
  pamAccountDAL,
  pamFolderDAL,
  projectDAL,
  orgDAL,
  userDAL,
  permissionService,
  licenseService,
  kmsService,
  gatewayV2Service,
  auditLogService,
  keyStore,
  tokenService,
  smtpService
}: TPamAccountServiceFactoryDep) => {
  const createMfaSession = async (userId: string, accountId: string, mfaMethod: MfaMethod): Promise<string> => {
    const mfaSessionId = crypto.randomBytes(32).toString("hex");
    const mfaSession: TMfaSession = {
      sessionId: mfaSessionId,
      userId,
      resourceId: accountId,
      status: MfaSessionStatus.PENDING,
      mfaMethod
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.MfaSession(mfaSessionId),
      KeyStoreTtls.MfaSessionInSeconds,
      JSON.stringify(mfaSession)
    );

    return mfaSessionId;
  };

  // Helper function to send MFA code via email
  const sendMfaCode = async (userId: string, email: string) => {
    const code = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailMfa,
      subjectLine: "Infisical PAM Access MFA code",
      recipients: [email],
      substitutions: {
        code
      }
    });
  };

  const create = async (
    {
      credentials,
      resourceId,
      name,
      description,
      folderId,
      rotationEnabled,
      rotationIntervalSeconds,
      requireMfa
    }: TCreateAccountDTO,
    actor: OrgServiceActor
  ) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

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

    const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
      resource.resourceType as PamResource,
      connectionDetails,
      resource.gatewayId,
      gatewayV2Service
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
        requireMfa
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
      requireMfa
    }: TUpdateAccountDTO,
    actor: OrgServiceActor
  ) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

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

    if (credentials !== undefined) {
      const connectionDetails = await decryptResourceConnectionDetails({
        projectId: account.projectId,
        encryptedConnectionDetails: resource.encryptedConnectionDetails,
        kmsService
      });

      const factory = PAM_RESOURCE_FACTORY_MAP[resource.resourceType as PamResource](
        resource.resourceType as PamResource,
        connectionDetails,
        resource.gatewayId,
        gatewayV2Service
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
      TPamAccounts & {
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

  const access = async (
    { accountId, actorEmail, actorIp, actorName, actorUserAgent, duration, mfaSessionId }: TAccessAccountDTO,
    actor: OrgServiceActor
  ) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

    const account = await pamAccountDAL.findById(accountId);
    if (!account) throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });

    const resource = await pamResourceDAL.findById(account.resourceId);
    if (!resource) throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });

    const project = await projectDAL.findById(account.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${account.projectId}' not found` });

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
      ProjectPermissionPamAccountActions.Access,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    // MFA is required for all PAM account access (as per user requirement)
    // Get user to check MFA configuration
    const actorUser = await userDAL.findById(actor.id);
    if (!actorUser) throw new NotFoundError({ message: `User with ID '${actor.id}' not found` });

    // If no mfaSessionId is provided, create a new MFA session
    if (!mfaSessionId && account.requireMfa) {
      // Get organization to check if MFA is enforced at org level
      const org = await orgDAL.findOrgById(project.orgId);
      if (!org) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

      // Determine which MFA method to use
      // Priority: org-enforced > user-selected > email as fallback
      const orgMfaMethod = org.enforceMfa
        ? ((org.selectedMfaMethod as MfaMethod | null) ?? MfaMethod.EMAIL)
        : undefined;
      const userMfaMethod = actorUser.isMfaEnabled
        ? ((actorUser.selectedMfaMethod as MfaMethod | null) ?? MfaMethod.EMAIL)
        : undefined;
      const mfaMethod = (orgMfaMethod ?? userMfaMethod ?? MfaMethod.EMAIL) as MfaMethod;

      // Create MFA session
      const newMfaSessionId = await createMfaSession(actorUser.id, accountId, mfaMethod);

      // If MFA method is email, send the code immediately
      if (mfaMethod === MfaMethod.EMAIL && actorUser.email) {
        await sendMfaCode(actorUser.id, actorUser.email);
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
      // If mfaSessionId is provided, verify it
      const mfaSessionKey = KeyStorePrefixes.MfaSession(mfaSessionId);
      const mfaSessionData = await keyStore.getItem(mfaSessionKey);

      if (!mfaSessionData) {
        throw new BadRequestError({
          message: "MFA session not found or expired"
        });
      }

      const mfaSession = JSON.parse(mfaSessionData) as TMfaSession;

      // Verify the session belongs to the current user
      if (mfaSession.userId !== actor.id) {
        throw new ForbiddenRequestError({
          message: "MFA session does not belong to current user"
        });
      }

      // Verify the session is for the same account
      if (mfaSession.resourceId !== accountId) {
        throw new BadRequestError({
          message: "MFA session is for a different resource"
        });
      }

      // Check if MFA session is active
      if (mfaSession.status !== MfaSessionStatus.ACTIVE) {
        throw new BadRequestError({
          message: "MFA session is not active. Please complete MFA verification first."
        });
      }

      // MFA verified successfully, delete the session and proceed with access
      await keyStore.deleteItem(mfaSessionKey);
    }

    const session = await pamSessionDAL.create({
      accountName: account.name,
      actorEmail,
      actorIp,
      actorName,
      actorUserAgent,
      projectId: account.projectId,
      resourceName: resource.name,
      resourceType: resource.resourceType,
      status: PamSessionStatus.Starting,
      accountId: account.id,
      userId: actor.id,
      expiresAt: new Date(Date.now() + duration)
    });

    const { connectionDetails, gatewayId, resourceType } = await decryptResource(
      resource,
      account.projectId,
      kmsService
    );

    const gatewayConnectionDetails = await gatewayV2Service.getPAMConnectionDetails({
      gatewayId,
      duration,
      sessionId: session.id,
      resourceType: resource.resourceType as PamResource,
      host: connectionDetails.host,
      port: connectionDetails.port,
      actorMetadata: {
        id: actor.id,
        type: actor.type,
        name: actorUser.email ?? ""
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
            projectId: account.projectId
          })) as TSqlResourceConnectionDetails;

          const credentials = await decryptAccountCredentials({
            encryptedCredentials: account.encryptedCredentials,
            kmsService,
            projectId: account.projectId
          });

          metadata = {
            username: credentials.username,
            database: connectionCredentials.database,
            accountName: account.name,
            accountPath
          };
        }
        break;
      case PamResource.SSH:
        {
          const credentials = await decryptAccountCredentials({
            encryptedCredentials: account.encryptedCredentials,
            kmsService,
            projectId: account.projectId
          });

          metadata = {
            username: credentials.username
          };
        }
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
      projectId: account.projectId,
      account,
      metadata
    };
  };

  const getSessionCredentials = async (sessionId: string, actor: OrgServiceActor) => {
    const orgLicensePlan = await licenseService.getPlan(actor.orgId);
    if (!orgLicensePlan.pam) {
      throw new BadRequestError({
        message: "PAM operation failed due to organization plan restrictions."
      });
    }

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

    if (resource.gatewayIdentityId !== actor.id) {
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
              gatewayV2Service
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
    access,
    getSessionCredentials,
    rotateAllDueAccounts
  };
};
