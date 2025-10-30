import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TPamAccounts, TPamResources } from "@app/db/schemas";
import { PAM_RESOURCE_FACTORY_MAP } from "@app/ee/services/pam-resource/pam-resource-factory";
import { decryptResource, decryptResourceConnectionDetails } from "@app/ee/services/pam-resource/pam-resource-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamAccountCredentials } from "../pam-resource/pam-resource-types";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamSessionStatus } from "../pam-session/pam-session-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { decryptAccount, decryptAccountCredentials, encryptAccountCredentials } from "./pam-account-fns";
import { TAccessAccountDTO, TCreateAccountDTO, TUpdateAccountDTO } from "./pam-account-types";

type TPamAccountServiceFactoryDep = {
  pamResourceDAL: TPamResourceDALFactory;
  pamSessionDAL: TPamSessionDALFactory;
  pamAccountDAL: TPamAccountDALFactory;
  pamFolderDAL: TPamFolderDALFactory;
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2Service: Pick<
    TGatewayV2ServiceFactory,
    "getPAMConnectionDetails" | "getPlatformConnectionDetailsByGatewayId"
  >;
  userDAL: TUserDALFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};
export type TPamAccountServiceFactory = ReturnType<typeof pamAccountServiceFactory>;

const ROTATION_CONCURRENCY_LIMIT = 10;

export const pamAccountServiceFactory = ({
  pamResourceDAL,
  pamSessionDAL,
  pamAccountDAL,
  pamFolderDAL,
  projectDAL,
  userDAL,
  permissionService,
  licenseService,
  kmsService,
  gatewayV2Service,
  auditLogService
}: TPamAccountServiceFactoryDep) => {
  const create = async (
    {
      credentials,
      resourceId,
      name,
      description,
      folderId,
      rotationEnabled,
      rotationIntervalSeconds
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
        rotationIntervalSeconds
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
    { accountId, credentials, description, name, rotationEnabled, rotationIntervalSeconds }: TUpdateAccountDTO,
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

      // Logic to prevent overwriting unedited censored values
      const finalCredentials = { ...credentials };
      if (credentials.password === "__INFISICAL_UNCHANGED__") {
        const decryptedCredentials = await decryptAccountCredentials({
          encryptedCredentials: account.encryptedCredentials,
          projectId: account.projectId,
          kmsService
        });

        finalCredentials.password = decryptedCredentials.password;
      }

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

  const list = async (projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountsWithResourceDetails = await pamAccountDAL.findWithResourceDetails({ projectId });

    const canReadFolders = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.PamFolders);

    const folders = canReadFolders ? await pamFolderDAL.find({ projectId }) : [];

    const decryptedAndPermittedAccounts: Array<
      TPamAccounts & {
        resource: Pick<TPamResources, "id" | "name" | "resourceType"> & { rotationCredentialsConfigured: boolean };
        credentials: TPamAccountCredentials;
        lastRotationMessage: string | null;
      }
    > = [];

    for await (const account of accountsWithResourceDetails) {
      const accountPath = await getFullPamFolderPath({
        pamFolderDAL,
        folderId: account.folderId,
        projectId: account.projectId
      });

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

    return {
      accounts: decryptedAndPermittedAccounts,
      folders
    };
  };

  const access = async (
    { accountId, actorEmail, actorIp, actorName, actorUserAgent, duration }: TAccessAccountDTO,
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
      ProjectPermissionPamAccountActions.Access,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

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

    const user = await userDAL.findById(actor.id);
    if (!user) throw new NotFoundError({ message: `User with ID '${actor.id}' not found` });

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
        name: user.email ?? ""
      }
    });

    if (!gatewayConnectionDetails) {
      throw new NotFoundError({ message: `Gateway connection details for gateway '${gatewayId}' not found.` });
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
      account
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

    // Verify that the session has not already had credentials fetched
    if (session.status !== PamSessionStatus.Starting) {
      throw new BadRequestError({ message: "Session has already been started" });
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

    // Mark session as started
    await pamSessionDAL.updateById(sessionId, {
      status: PamSessionStatus.Active,
      startedAt: new Date()
    });

    return {
      credentials: {
        ...decryptedResource.connectionDetails,
        ...decryptedAccount.credentials
      },
      projectId: project.id,
      account
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
