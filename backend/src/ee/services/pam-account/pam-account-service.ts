import { ForbiddenError } from "@casl/ability";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import {
  checkAccountAccess,
  checkFolderPermission,
  getAccessibleResourceIds,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { validateGatewayAttachment, validateRecordingConnection } from "../pam/pam-validators";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamAccountDALFactory } from "./pam-account-dal";
import { validateConnectionDetails, validateCredentials } from "./pam-account-schemas";
import {
  TCreatePamAccountDTO,
  TDeletePamAccountDTO,
  TGetPamAccountDTO,
  TListAccessibleAccountsDTO,
  TListPamAccountsDTO,
  TUpdatePamAccountDTO
} from "./pam-account-types";

type TPamAccountServiceFactoryDep = {
  pamAccountDAL: TPamAccountDALFactory;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById">;
  pamAccountTemplateDAL: Pick<TPamAccountTemplateDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "delete" | "findResourceMembershipsForActor">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "delete">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getResourcePermission" | "getOrgPermission"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne">;
};

export type TPamAccountServiceFactory = ReturnType<typeof pamAccountServiceFactory>;

export const pamAccountServiceFactory = (deps: TPamAccountServiceFactoryDep) => {
  const {
    pamAccountDAL,
    pamFolderDAL,
    pamAccountTemplateDAL,
    membershipDAL,
    membershipRoleDAL,
    permissionService,
    kmsService
  } = deps;

  const getProjectCipher = async (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const encrypt = async (projectId: string, data: Record<string, unknown>) => {
    const { encryptor } = await getProjectCipher(projectId);
    return encryptor({ plainText: Buffer.from(JSON.stringify(data)) }).cipherTextBlob;
  };

  const decrypt = async (projectId: string, blob: Buffer): Promise<Record<string, unknown>> => {
    const { decryptor } = await getProjectCipher(projectId);
    return JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as Record<string, unknown>;
  };

  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  const checkFolder = (folderId: string, projectId: string, ctx: TActorContext) =>
    checkFolderPermission(permissionService, folderId, projectId, ctx);

  const list = async ({ projectId, folderId, templateId, search, ...ctx }: TListPamAccountsDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);

    const { folderIds, accountIds } = await getAccessibleResourceIds(membershipDAL, projectId, ctx);
    if (folderIds.length === 0 && accountIds.length === 0) return [];

    const { accounts } = await pamAccountDAL.findAccessible(projectId, folderIds, accountIds, {
      folderId,
      templateId,
      search
    });

    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      folderId: a.folderId,
      folderName: a.folderName,
      templateId: a.templateId,
      templateName: a.templateName,
      accountType: a.accountType,
      projectId: a.projectId,
      gatewayId: a.gatewayId,
      gatewayPoolId: a.gatewayPoolId,
      recordingConnectionId: a.recordingConnectionId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
  };

  const checkAccount = (
    accountId: string,
    folderId: string | null | undefined,
    projectId: string,
    action: ResourcePermissionPamResourceActions,
    ctx: TActorContext
  ) => checkAccountAccess(permissionService, accountId, folderId, projectId, action, ctx);

  const getById = async ({ accountId, projectId, ...ctx }: TGetPamAccountDTO & TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.ReadAccounts, ctx);

    const connectionDetails = await decrypt(projectId, account.encryptedConnectionDetails);

    return {
      id: account.id,
      name: account.name,
      description: account.description,
      folderId: account.folderId,
      folderName: account.folderName,
      templateId: account.templateId,
      templateName: account.templateName,
      templateAccessPolicy: account.templateAccessPolicy,
      templateSettings: account.templateSettings,
      accountType: account.accountType,
      projectId: account.projectId,
      gatewayId: account.gatewayId,
      gatewayPoolId: account.gatewayPoolId,
      recordingConnectionId: account.recordingConnectionId,
      connectionDetails,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  };

  const create = async ({
    projectId,
    accountType,
    name,
    description,
    folderId,
    templateId,
    connectionDetails,
    credentials,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TCreatePamAccountDTO & TActorContext) => {
    const { permission } = await checkFolder(folderId, projectId, ctx);
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.CreateAccounts,
      ResourcePermissionSub.PamResource
    );

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
    }

    const template = await pamAccountTemplateDAL.findById(templateId);
    if (!template || template.projectId !== projectId) {
      throw new NotFoundError({ message: `Template with ID '${templateId}' not found` });
    }
    if (template.type !== accountType) {
      throw new BadRequestError({
        message: `Template type '${template.type}' does not match account type '${accountType}'`
      });
    }

    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);
    await validateRecordingConnection(deps, recordingConnectionId, ctx);

    const validatedConnectionDetails = validateConnectionDetails(accountType, connectionDetails);
    const validatedCredentials = validateCredentials(accountType, credentials);

    const encryptedConnectionDetails = await encrypt(projectId, validatedConnectionDetails);
    const encryptedCredentials = await encrypt(projectId, validatedCredentials);

    try {
      const account = await pamAccountDAL.create({
        projectId,
        name,
        description,
        folderId,
        templateId,
        encryptedConnectionDetails,
        encryptedCredentials,
        gatewayId,
        gatewayPoolId,
        recordingConnectionId
      });

      return {
        id: account.id,
        name: account.name,
        description: account.description,
        folderId: account.folderId ?? null,
        templateId: account.templateId,
        projectId: account.projectId,
        gatewayId: account.gatewayId,
        gatewayPoolId: account.gatewayPoolId,
        recordingConnectionId: account.recordingConnectionId,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        accountType,
        folderName: folder.name,
        templateName: template.name,
        connectionDetails: validatedConnectionDetails
      };
    } catch (err) {
      if (err instanceof DatabaseError) {
        const code = (err.error as { code?: string })?.code;
        if (code === DatabaseErrorCode.UniqueViolation) {
          throw new BadRequestError({ message: `An account named "${name}" already exists in this folder` });
        }
        if (code === DatabaseErrorCode.ForeignKeyViolation) {
          throw new BadRequestError({
            message: "Invalid reference: the specified gateway, pool, or template does not exist"
          });
        }
      }
      throw err;
    }
  };

  const update = async ({
    accountId,
    projectId,
    accountType,
    name,
    description,
    folderId,
    templateId,
    connectionDetails,
    credentials,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TUpdatePamAccountDTO & TActorContext) => {
    const existing = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (existing.accountType !== accountType) {
      throw new BadRequestError({
        message: `Account '${accountId}' is type '${existing.accountType}', not '${accountType}'`
      });
    }

    await checkAccount(accountId, existing.folderId, projectId, ResourcePermissionPamResourceActions.EditAccounts, ctx);

    if (folderId) {
      const folder = await pamFolderDAL.findById(folderId);
      if (!folder || folder.projectId !== projectId) {
        throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
      }
    }

    if (templateId) {
      const template = await pamAccountTemplateDAL.findById(templateId);
      if (!template || template.projectId !== projectId) {
        throw new NotFoundError({ message: `Template with ID '${templateId}' not found` });
      }
      if (template.type !== accountType) {
        throw new BadRequestError({
          message: `Template '${templateId}' is for type '${template.type}', not '${accountType}'`
        });
      }
    }

    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);
    await validateRecordingConnection(deps, recordingConnectionId, ctx);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (folderId !== undefined) updateData.folderId = folderId;
    if (templateId !== undefined) updateData.templateId = templateId;
    if (gatewayId !== undefined) updateData.gatewayId = gatewayId;
    if (gatewayPoolId !== undefined) updateData.gatewayPoolId = gatewayPoolId;
    if (recordingConnectionId !== undefined) updateData.recordingConnectionId = recordingConnectionId;

    if (connectionDetails) {
      const validated = validateConnectionDetails(accountType, connectionDetails);
      updateData.encryptedConnectionDetails = await encrypt(projectId, validated);
    }

    if (credentials) {
      const validated = validateCredentials(accountType, credentials);
      updateData.encryptedCredentials = await encrypt(projectId, validated);
    }

    try {
      return await pamAccountDAL.updateById(accountId, updateData);
    } catch (err) {
      if (err instanceof DatabaseError) {
        const code = (err.error as { code?: string })?.code;
        if (code === DatabaseErrorCode.UniqueViolation) {
          throw new BadRequestError({ message: `An account named "${name}" already exists in this folder` });
        }
        if (code === DatabaseErrorCode.ForeignKeyViolation) {
          throw new BadRequestError({
            message: "Invalid reference: the specified gateway, pool, or template does not exist"
          });
        }
      }
      throw err;
    }
  };

  const deleteAccount = async ({ accountId, projectId, ...ctx }: TDeletePamAccountDTO & TActorContext) => {
    const existing = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccount(
      accountId,
      existing.folderId,
      projectId,
      ResourcePermissionPamResourceActions.DeleteAccounts,
      ctx
    );

    return pamAccountDAL.transaction(async (tx) => {
      const memberships = await membershipDAL.find(
        {
          scope: RESOURCE_SCOPE,
          scopeResourceType: ResourceType.PamAccount,
          scopeResourceId: accountId
        },
        { tx }
      );

      if (memberships.length > 0) {
        const ids = memberships.map((m) => m.id);
        await membershipRoleDAL.delete({ $in: { membershipId: ids } }, tx);
        await membershipDAL.delete({ $in: { id: ids } }, tx);
      }

      return pamAccountDAL.deleteById(accountId, tx);
    });
  };

  const listAccessible = async ({
    projectId,
    offset,
    limit,
    ...ctx
  }: TListAccessibleAccountsDTO & TActorContext & { offset?: number; limit?: number }) => {
    await verifyMembership(projectId, ctx);

    const { folderIds, accountIds } = await getAccessibleResourceIds(membershipDAL, projectId, ctx);
    if (folderIds.length === 0 && accountIds.length === 0) return { accounts: [], totalCount: 0 };

    const { accounts, totalCount } = await pamAccountDAL.findAccessible(projectId, folderIds, accountIds, {
      offset,
      limit
    });

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        folderId: a.folderId,
        folderName: a.folderName,
        templateId: a.templateId,
        templateName: a.templateName,
        accountType: a.accountType,
        projectId: a.projectId,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      })),
      totalCount
    };
  };

  const getOrCreateSshCa = async ({ accountId, projectId, ...ctx }: TGetPamAccountDTO & TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.EditAccounts, ctx);

    if (account.caPublicKey) {
      return { publicKey: account.caPublicKey, created: false };
    }

    const keyAlgorithm = SshCertKeyAlgorithm.ED25519;
    const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

    const { encryptor } = await getProjectCipher(projectId);
    const encryptedCaPrivateKey = encryptor({ plainText: Buffer.from(privateKey) }).cipherTextBlob;

    await pamAccountDAL.updateById(accountId, {
      encryptedCaPrivateKey,
      caPublicKey: publicKey,
      caKeyAlgorithm: keyAlgorithm
    });

    return { publicKey, created: true, keyAlgorithm };
  };

  const getSshCaPublicKey = async (accountId: string) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }
    if (!account.caPublicKey) {
      throw new BadRequestError({ message: "SSH CA has not been configured for this account" });
    }
    return { publicKey: account.caPublicKey };
  };

  return { list, listAccessible, getById, create, update, deleteAccount, getOrCreateSshCa, getSshCaPublicKey };
};
