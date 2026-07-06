import { createMongoAbility, ForbiddenError, MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSet,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { createSshKeyPair } from "@app/ee/services/ssh/ssh-certificate-authority-fns";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { conditionsMatcher } from "@app/lib/casl";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { PamAccountType } from "../pam/pam-enums";
import {
  checkAccountAccess,
  checkFolderPermission,
  getResourceIdsWithActions,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import {
  mintCorsProbeUrl,
  resolveOverridesS3Config,
  validateGatewayAttachment,
  validateRecordingConnection
} from "../pam/pam-validators";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamAccountDALFactory } from "./pam-account-dal";
import {
  getAccountAccessibilityIssues,
  isCredentialConfigured,
  parseInternalMetadata,
  sanitizeCredentials,
  type TSshInternalMetadata,
  validateConnectionDetails,
  validateCredentials
} from "./pam-account-schemas";
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
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "delete" | "find">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getResourcePermission" | "getOrgPermission"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne" | "findById">;
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

  const computeAccessibility = (a: {
    accountType: string;
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    recordingConnectionId?: string | null;
    templateGatewayId: string | null;
    templateGatewayPoolId: string | null;
    templateRecordingConnectionId: string | null;
    settingsOverrides?: unknown;
    templateSettings: unknown;
    credentialConfigured: boolean;
  }) => {
    const accessibilityIssues = getAccountAccessibilityIssues(a);
    return { isAccessible: accessibilityIssues.length === 0, accessibilityIssues };
  };

  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  const checkFolder = (folderId: string, projectId: string, ctx: TActorContext) =>
    checkFolderPermission(permissionService, folderId, projectId, ctx);

  const list = async ({ projectId, folderId, templateId, search, ...ctx }: TListPamAccountsDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.ReadAccounts] },
      ctx
    );
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
      ...computeAccessibility(a),
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
    const credentials = sanitizeCredentials(
      account.accountType as PamAccountType,
      await decrypt(projectId, account.encryptedCredentials)
    );

    return {
      id: account.id,
      name: account.name,
      description: account.description,
      folderId: account.folderId,
      folderName: account.folderName,
      templateId: account.templateId,
      templateName: account.templateName,
      templatePolicies: account.templatePolicies,
      templateSettings: account.templateSettings,
      accountType: account.accountType,
      projectId: account.projectId,
      gatewayId: account.gatewayId,
      gatewayPoolId: account.gatewayPoolId,
      recordingConnectionId: account.recordingConnectionId,
      settingsOverrides: account.settingsOverrides ?? null,
      connectionDetails,
      credentials,
      ...computeAccessibility(account),
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
    settingsOverrides,
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

    const resolvedS3Config = await resolveOverridesS3Config(
      deps,
      settingsOverrides,
      recordingConnectionId ?? template.recordingConnectionId,
      ctx
    );

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
        credentialConfigured: isCredentialConfigured(accountType, validatedCredentials),
        gatewayId,
        gatewayPoolId,
        recordingConnectionId,
        settingsOverrides: settingsOverrides ?? null
      });

      const corsProbeUrl = resolvedS3Config ? await mintCorsProbeUrl(resolvedS3Config) : null;

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
        settingsOverrides: account.settingsOverrides ?? null,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        accountType,
        folderName: folder.name,
        templateName: template.name,
        connectionDetails: validatedConnectionDetails,
        corsProbeUrl
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
    settingsOverrides,
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

    const resolvedS3Config = await resolveOverridesS3Config(
      deps,
      settingsOverrides,
      (recordingConnectionId !== undefined ? recordingConnectionId : existing.recordingConnectionId) ??
        existing.templateRecordingConnectionId,
      ctx
    );

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (folderId !== undefined) updateData.folderId = folderId;
    if (templateId !== undefined) updateData.templateId = templateId;
    if (gatewayId !== undefined) updateData.gatewayId = gatewayId;
    if (gatewayPoolId !== undefined) updateData.gatewayPoolId = gatewayPoolId;
    if (recordingConnectionId !== undefined) updateData.recordingConnectionId = recordingConnectionId;
    if (settingsOverrides !== undefined) updateData.settingsOverrides = settingsOverrides;

    if (connectionDetails) {
      const validated = validateConnectionDetails(accountType, connectionDetails);
      updateData.encryptedConnectionDetails = await encrypt(projectId, validated);
    }

    if (credentials) {
      const existingCredentials = await decrypt(projectId, existing.encryptedCredentials);
      const validated = validateCredentials(accountType, { ...existingCredentials, ...credentials });
      updateData.encryptedCredentials = await encrypt(projectId, validated);
      updateData.credentialConfigured = isCredentialConfigured(accountType, validated);
    }

    const routingChanged = connectionDetails !== undefined || gatewayId !== undefined || gatewayPoolId !== undefined;
    if (routingChanged && existing.rotationAccountId) {
      updateData.rotationAccountId = null;
    }

    try {
      const account = await pamAccountDAL.transaction(async (tx) => {
        const updated = await pamAccountDAL.updateById(accountId, updateData, tx);
        if (routingChanged) {
          await pamAccountDAL.update(
            { rotationAccountId: accountId },
            { rotationAccountId: null, nextRotationAt: null },
            tx
          );
        }
        // A template move, credential change, or a cleared binding can flip rotation readiness; re-derive the schedule
        // atomically with the write so a failure can't leave a stale nextRotationAt.
        if (templateId !== undefined || credentials || routingChanged) {
          await pamAccountDAL.reconcileRotationScheduleForAccount(accountId, tx);
        }
        return updated;
      });
      const corsProbeUrl = resolvedS3Config ? await mintCorsProbeUrl(resolvedS3Config) : null;
      return { ...account, corsProbeUrl };
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

    try {
      return await pamAccountDAL.transaction(async (tx) => {
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

        await pamAccountDAL.updateById(accountId, { rotationAccountId: null }, tx);

        return pamAccountDAL.deleteById(accountId, tx);
      });
    } catch (err) {
      // The ON DELETE RESTRICT FK on rotationAccountId is the race-safe guard; on violation, look up the dependents
      // to name them (rather than paying for that lookup on every delete).
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        const dependents = (await pamAccountDAL.find({ rotationAccountId: accountId })).filter(
          (dependent) => dependent.id !== accountId
        );
        const readChecks = await Promise.all(
          dependents.map(async (dependent) => ({
            name: dependent.name,
            canRead: await checkAccount(
              dependent.id,
              dependent.folderId,
              projectId,
              ResourcePermissionPamResourceActions.ReadAccounts,
              ctx
            )
              .then(() => true)
              .catch(() => false)
          }))
        );
        const readableNames = readChecks.filter((c) => c.canRead).map((c) => c.name);
        const hiddenCount = readChecks.length - readableNames.length;
        const parts = [
          ...(readableNames.length ? [readableNames.join(", ")] : []),
          ...(hiddenCount ? [`${hiddenCount} other account${hiddenCount > 1 ? "s" : ""}`] : [])
        ];
        throw new BadRequestError({
          message: parts.length
            ? `This account is the rotation account for: ${parts.join(", and ")}. Reassign or clear their rotation account before deleting this one.`
            : "This account is used as the rotation account for another account. Reassign it before deleting this one."
        });
      }
      throw err;
    }
  };

  const listAccessible = async ({
    projectId,
    offset,
    limit,
    search,
    folderId,
    accountType,
    ...ctx
  }: TListAccessibleAccountsDTO & TActorContext & { offset?: number; limit?: number }) => {
    await verifyMembership(projectId, ctx);

    const { folderIds, accountIds } = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.ReadAccounts] },
      ctx
    );
    if (folderIds.length === 0 && accountIds.length === 0) return { accounts: [], totalCount: 0 };

    const launchScopes = await getResourceIdsWithActions(
      membershipDAL,
      membershipRoleDAL,
      projectId,
      { allOf: [ResourcePermissionPamResourceActions.LaunchSessions] },
      ctx
    );
    const launchFolderIds = new Set(launchScopes.folderIds);
    const launchAccountIds = new Set(launchScopes.accountIds);

    const { accounts, totalCount } = await pamAccountDAL.findAccessible(projectId, folderIds, accountIds, {
      offset,
      limit,
      search,
      folderId,
      accountType,
      onlyAccessible: true
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
        canLaunch: launchAccountIds.has(a.id) || (!!a.folderId && launchFolderIds.has(a.folderId)),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      })),
      totalCount
    };
  };

  const decryptInternalMetadata = async (projectId: string, blob: Buffer | null | undefined) => {
    if (!blob) return null;
    return decrypt(projectId, blob);
  };

  const getOrCreateSshCa = async ({ accountId, projectId, ...ctx }: TGetPamAccountDTO & TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.EditAccounts, ctx);

    const existing = parseInternalMetadata(
      account.accountType as PamAccountType,
      await decryptInternalMetadata(projectId, account.encryptedInternalMetadata)
    );

    if (existing?.caPublicKey) {
      return { publicKey: existing.caPublicKey, created: false };
    }

    const keyAlgorithm = SshCertKeyAlgorithm.ED25519;
    const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

    const metadata: TSshInternalMetadata = {
      caPublicKey: publicKey,
      caKeyAlgorithm: keyAlgorithm,
      caPrivateKey: privateKey
    };

    await pamAccountDAL.updateById(accountId, {
      encryptedInternalMetadata: await encrypt(projectId, metadata)
    });

    return { publicKey, created: true, keyAlgorithm };
  };

  const getSshCaPublicKey = async ({ accountId, projectId, ...ctx }: TGetPamAccountDTO & TActorContext) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    await checkAccount(accountId, account.folderId, projectId, ResourcePermissionPamResourceActions.EditAccounts, ctx);

    const metadata = parseInternalMetadata(
      account.accountType as PamAccountType,
      await decryptInternalMetadata(projectId, account.encryptedInternalMetadata)
    );

    if (!metadata?.caPublicKey) {
      throw new BadRequestError({ message: "SSH CA has not been configured for this account" });
    }
    return { publicKey: metadata.caPublicKey };
  };

  const getAccountPermissions = async ({ accountId, projectId, ...ctx }: TGetPamAccountDTO & TActorContext) => {
    const account = await pamAccountDAL.findById(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    const allRules: RawRuleOf<MongoAbility<ResourcePermissionSet, MongoQuery>>[] = [];
    const allMemberships: Awaited<ReturnType<typeof permissionService.getResourcePermission>>["memberships"] = [];

    if (account.folderId) {
      try {
        const folderResult = await permissionService.getResourcePermission({
          actor: ctx.actor,
          actorId: ctx.actorId,
          projectId,
          resourceType: ResourceType.PamFolder,
          resourceId: account.folderId,
          actorAuthMethod: ctx.actorAuthMethod,
          actorOrgId: ctx.actorOrgId
        });
        allRules.push(...folderResult.permission.rules);
        allMemberships.push(...folderResult.memberships);
      } catch (err) {
        if (!(err instanceof ForbiddenRequestError)) throw err;
      }
    }

    try {
      const accountResult = await permissionService.getResourcePermission({
        actor: ctx.actor,
        actorId: ctx.actorId,
        projectId,
        resourceType: ResourceType.PamAccount,
        resourceId: accountId,
        actorAuthMethod: ctx.actorAuthMethod,
        actorOrgId: ctx.actorOrgId
      });
      allRules.push(...accountResult.permission.rules);
      allMemberships.push(...accountResult.memberships);
    } catch (err) {
      if (!(err instanceof ForbiddenRequestError)) throw err;
    }

    const mergedPermission = createMongoAbility<ResourcePermissionSet>(allRules, { conditionsMatcher });

    ForbiddenError.from(mergedPermission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ReadAccounts,
      ResourcePermissionSub.PamResource
    );

    // Only member managers get the roster; read-only roles must not enumerate members.
    const canManageMembers = mergedPermission.can(
      ResourcePermissionPamResourceActions.ManageMembers,
      ResourcePermissionSub.PamResource
    );

    return {
      permissions: packRules(mergedPermission.rules),
      memberships: canManageMembers ? allMemberships : []
    };
  };

  return {
    list,
    listAccessible,
    getById,
    create,
    update,
    deleteAccount,
    getOrCreateSshCa,
    getSshCaPublicKey,
    getAccountPermissions
  };
};
