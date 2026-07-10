import { createMongoAbility, ForbiddenError, MongoAbility, MongoQuery, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { RESOURCE_SCOPE, ResourceType, TPamAccountTemplates } from "@app/db/schemas";
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

import { PamAccessStatus, PamAccountType, PamProductRole } from "../pam/pam-enums";
import {
  checkAccountAccess,
  checkFolderPermission,
  getResourceIdsWithActions,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { resolveAccessControls } from "../pam/pam-policies";
import {
  mintCorsProbeUrl,
  resolveOverridesS3Config,
  validateGatewayAttachment,
  validateRecordingConnection
} from "../pam/pam-validators";
import { TPamAccessRequestServiceFactory } from "../pam-access-request/pam-access-request-service";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { PamTemplateSettingsSchema } from "../pam-account-template/pam-account-template-schemas";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamAccountDALFactory } from "./pam-account-dal";
import {
  accountTypeHasNoCredentials,
  getAccountAccessibilityIssues,
  isCredentialConfigured,
  PamAccountAccessibilityIssue,
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
  pamAccessRequestService: Pick<
    TPamAccessRequestServiceFactory,
    "getAccessStatusBatch" | "getFolderPolicyConfigured" | "cleanupAccountResources"
  >;
};

const assertPasswordMeetsRequirements = (credentials: unknown, templateSettings: unknown) => {
  const requirements = PamTemplateSettingsSchema.safeParse(templateSettings).data?.passwordRequirements;
  const { password } = credentials as { password?: string };
  if (!requirements || !password) return;

  let upper = 0;
  let lower = 0;
  let digit = 0;
  let symbol = 0;
  const allowed = requirements.allowedSymbols ? new Set(requirements.allowedSymbols.split("")) : null;
  const disallowed = new Set<string>();
  for (const ch of password) {
    if (ch >= "A" && ch <= "Z") upper += 1;
    else if (ch >= "a" && ch <= "z") lower += 1;
    else if (ch >= "0" && ch <= "9") digit += 1;
    else {
      symbol += 1;
      if (allowed && !allowed.has(ch)) disallowed.add(ch);
    }
  }

  const violations: string[] = [];
  if (password.length < requirements.length) violations.push(`be at least ${requirements.length} characters long`);
  if (upper < requirements.required.uppercase)
    violations.push(`include at least ${requirements.required.uppercase} uppercase letter(s)`);
  if (lower < requirements.required.lowercase)
    violations.push(`include at least ${requirements.required.lowercase} lowercase letter(s)`);
  if (digit < requirements.required.digits)
    violations.push(`include at least ${requirements.required.digits} number(s)`);
  if (symbol < requirements.required.symbols)
    violations.push(`include at least ${requirements.required.symbols} symbol(s)`);
  if (allowed && disallowed.size > 0) violations.push(`only use these symbols: ${requirements.allowedSymbols}`);

  if (violations.length > 0) {
    throw new BadRequestError({
      message: `Password does not meet this template's requirements: it must ${violations.join(", ")}.`
    });
  }
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

    const folderIdsRequiringApproval = [
      ...new Set(
        accounts
          .filter((a) => resolveAccessControls(a.templatePolicies).requiresApproval && a.folderId)
          .map((a) => a.folderId!)
      )
    ];
    const foldersWithApprovalPolicy =
      await deps.pamAccessRequestService.getFolderPolicyConfigured(folderIdsRequiringApproval);

    return accounts.map((a) => {
      const { accessibilityIssues, isAccessible } = computeAccessibility(a);
      const { requiresApproval } = resolveAccessControls(a.templatePolicies);
      if (requiresApproval && a.folderId && !foldersWithApprovalPolicy.has(a.folderId)) {
        accessibilityIssues.push(PamAccountAccessibilityIssue.NoApprovalConfig);
      }
      return {
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
        isAccessible: isAccessible && accessibilityIssues.length === 0,
        accessibilityIssues,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
      };
    });
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

    const effectiveGatewayId = gatewayId ?? template.gatewayId;
    await validateGatewayAttachment(
      deps,
      effectiveGatewayId,
      effectiveGatewayId ? null : (gatewayPoolId ?? template.gatewayPoolId),
      ctx
    );
    await validateRecordingConnection(deps, recordingConnectionId, ctx);

    const resolvedS3Config = await resolveOverridesS3Config(
      deps,
      settingsOverrides,
      recordingConnectionId ?? template.recordingConnectionId,
      ctx
    );

    const validatedConnectionDetails = validateConnectionDetails(accountType, connectionDetails);
    const validatedCredentials = validateCredentials(accountType, credentials);
    assertPasswordMeetsRequirements(validatedCredentials, template.settings);

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
        credentialConfigured: accountTypeHasNoCredentials(accountType) ? true : isCredentialConfigured(accountType, validatedCredentials),
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
      // Moving an account into a different folder requires create rights on the destination: folder
      // roles cascade to the accounts inside, so EditAccounts alone must not relocate an account into a
      // folder where the actor would gain ViewCredentials/LaunchSessions.
      if (folderId !== existing.folderId) {
        const { permission } = await checkFolder(folderId, projectId, ctx);
        ForbiddenError.from(permission).throwUnlessCan(
          ResourcePermissionPamResourceActions.CreateAccounts,
          ResourcePermissionSub.PamResource
        );
      }
    }

    let template: TPamAccountTemplates | undefined;
    if (templateId) {
      template = await pamAccountTemplateDAL.findById(templateId);
      if (!template || template.projectId !== projectId) {
        throw new NotFoundError({ message: `Template with ID '${templateId}' not found` });
      }
      if (template.type !== accountType) {
        throw new BadRequestError({
          message: `Template '${templateId}' is for type '${template.type}', not '${accountType}'`
        });
      }
      // A template carries governance settings (e.g. requiresApproval) and is product-admin-managed, so
      // re-pointing an account's template is an admin-only action to prevent bypassing those controls.
      if (templateId !== existing.templateId) {
        const { hasRole } = await verifyMembership(projectId, ctx);
        if (!hasRole(PamProductRole.Admin)) {
          throw new ForbiddenRequestError({ message: "Only PAM admins can change an account's template" });
        }
      }
    }

    // Re-validate whenever the effective gateway binding could change. The binding is the account's own
    // gateway/pool falling back to the template's, so an inherited gateway still requires AttachGateways.
    if (gatewayId !== undefined || gatewayPoolId !== undefined || templateId !== undefined) {
      const nextGatewayId = gatewayId !== undefined ? gatewayId : existing.gatewayId;
      const nextGatewayPoolId = gatewayPoolId !== undefined ? gatewayPoolId : existing.gatewayPoolId;
      const nextTemplateGatewayId = template ? template.gatewayId : existing.templateGatewayId;
      const nextTemplateGatewayPoolId = template ? template.gatewayPoolId : existing.templateGatewayPoolId;

      const effectiveGatewayId = nextGatewayId ?? nextTemplateGatewayId;
      await validateGatewayAttachment(
        deps,
        effectiveGatewayId,
        effectiveGatewayId ? null : (nextGatewayPoolId ?? nextTemplateGatewayPoolId),
        ctx
      );
    }
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

    let principalChanged = false;
    if (credentials) {
      const existingCredentials = await decrypt(projectId, existing.encryptedCredentials);
      const validated = validateCredentials(accountType, { ...existingCredentials, ...credentials });
      const templateSettings = templateId
        ? (await pamAccountTemplateDAL.findById(templateId))?.settings
        : existing.templateSettings;
      assertPasswordMeetsRequirements(validated, templateSettings);
      updateData.encryptedCredentials = await encrypt(projectId, validated);
      updateData.credentialConfigured = isCredentialConfigured(accountType, validated);
      const oldUsername = (existingCredentials as { username?: string }).username;
      const newUsername = (validated as { username?: string }).username;
      if (oldUsername !== newUsername) principalChanged = true;
    }

    let routingChanged =
      (gatewayId !== undefined && gatewayId !== existing.gatewayId) ||
      (gatewayPoolId !== undefined && gatewayPoolId !== existing.gatewayPoolId);
    if (connectionDetails) {
      const oldConn = validateConnectionDetails(
        accountType,
        await decrypt(projectId, existing.encryptedConnectionDetails)
      ) as { host?: string; port?: number };
      const newConn = validateConnectionDetails(accountType, connectionDetails) as { host?: string; port?: number };
      if (oldConn.host !== newConn.host || oldConn.port !== newConn.port) routingChanged = true;
    }
    if ((routingChanged || principalChanged) && existing.rotationAccountId) {
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

        await deps.pamAccessRequestService.cleanupAccountResources(
          { accountId, folderId: existing.folderId, projectId, actorId: ctx.actorId },
          tx
        );

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
        if (dependents.length) {
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
        // The other restricting reference is a discovery source using this account as its credential
        throw new BadRequestError({
          message: "This account is used as the credential for a discovery source. Delete that source first."
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

    const accountsRequiringApproval = accounts.filter(
      (a) => resolveAccessControls(a.templatePolicies).requiresApproval
    );
    const accountIdsRequiringApproval = accountsRequiringApproval.map((a) => a.id);

    const folderIdsRequiringApproval = [
      ...new Set(accountsRequiringApproval.map((a) => a.folderId).filter(Boolean) as string[])
    ];
    const [accessStatusMap, foldersWithApprovalPolicy] = await Promise.all([
      deps.pamAccessRequestService.getAccessStatusBatch(ctx.actorId, accountIdsRequiringApproval, projectId),
      deps.pamAccessRequestService.getFolderPolicyConfigured(folderIdsRequiringApproval)
    ]);

    return {
      accounts: accounts.map((a) => {
        const { requiresApproval, requireReason } = resolveAccessControls(a.templatePolicies);
        const statusEntry = accessStatusMap.get(a.id);
        const hasPolicyConfigured = a.folderId ? foldersWithApprovalPolicy.has(a.folderId) : false;
        let disabledReason: string | null = null;
        if (requiresApproval && !hasPolicyConfigured) {
          disabledReason =
            "This account requires approval, but its folder has no approvers yet. Ask a folder admin to add approvers under the folder's Approvals tab.";
        }
        return {
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
          requiresApproval,
          requireReason,
          accessStatus: requiresApproval ? (statusEntry?.accessStatus ?? PamAccessStatus.None) : PamAccessStatus.None,
          grantExpiresAt: statusEntry?.grantExpiresAt ?? null,
          disabledReason,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt
        };
      }),
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
