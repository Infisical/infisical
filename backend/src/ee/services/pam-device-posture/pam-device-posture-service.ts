import crypto from "node:crypto";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { PamResourcePermissionActions, TPamPermissionService } from "@app/domains/pam/pam/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import {
  getRipplingDeviceBySerial,
  getRipplingWorkerByEmail,
  TRipplingConnection
} from "@app/services/app-connection/rippling";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import { isDevicePostureCondition } from "@app/services/approval-policy/auto-approval/auto-approval-fns";
import { TAutoApprovalServiceFactory } from "@app/services/approval-policy/auto-approval/auto-approval-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { PamAccessType } from "../pam/pam-enums";
import { checkAccountAccess, verifyProductMembership } from "../pam/pam-permission";
import { resolveAccessControls } from "../pam/pam-policies";
import {
  PAM_DEVICE_POSTURE_CHECK_LABELS,
  PAM_DEVICE_VERIFICATION_CODE_TTL_MS,
  PAM_DEVICE_VERIFICATION_VALIDITY_MS,
  PamDevicePostureCheck,
  PamDevicePostureErrorCode,
  PamDevicePostureProvider,
  PamDevicePostureScope,
  PamDeviceVerificationStatus
} from "./pam-device-posture-enums";
import {
  describeDevice,
  evaluateDevicePosture,
  getDevicePostureProviderNames,
  TDevicePostureFacts,
  toRipplingDeviceFacts
} from "./pam-device-posture-fns";
import {
  TPamDeviceInfo,
  TPamDevicePostureCheckResult,
  TPamDevicePosturePolicy,
  TPamDeviceVerificationResponse
} from "./pam-device-posture-schemas";
import { TPamDeviceVerificationDALFactory } from "./pam-device-verification-dal";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateCode = () => {
  const pick = () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

type TPamDevicePostureServiceFactoryDep = {
  pamDeviceVerificationDAL: TPamDeviceVerificationDALFactory;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails">;
  pamPermissionService: Pick<TPamPermissionService, "getPamPermission" | "assertAccountAccess" | "canAccessAccount">;
  projectPermissionService: Pick<TProjectPermissionService, "getProjectPermission">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByProjectId">;
  approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "getActiveGrants">;
  autoApprovalService: Pick<TAutoApprovalServiceFactory, "findByPolicyIds">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsDataKeyService: TKmsDataKeyService;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TPamDevicePostureServiceFactory = ReturnType<typeof pamDevicePostureServiceFactory>;

type TVerificationRow = Awaited<ReturnType<TPamDeviceVerificationDALFactory["findById"]>>;

export const toVerificationResponse = (
  row: NonNullable<TVerificationRow>,
  extra?: { accountName?: string; providers?: string[] }
): TPamDeviceVerificationResponse => {
  const isExpired =
    row.status === PamDeviceVerificationStatus.Pending && new Date(row.expiresAt).getTime() < Date.now();
  if (isExpired) return { id: row.id, status: PamDeviceVerificationStatus.Expired };
  if (row.status === PamDeviceVerificationStatus.Pending) return { id: row.id, status: row.status };
  return {
    id: row.id,
    status: row.status as PamDeviceVerificationStatus,
    message: row.message ?? null,
    device: (row.device as TPamDeviceVerificationResponse["device"]) ?? null,
    checks: (row.checks as TPamDevicePostureCheckResult[]) ?? [],
    ...extra
  };
};

const getGrantDeviceSerialNumber = (attributes: unknown) => {
  const serial = (attributes as { deviceSerialNumber?: unknown } | null)?.deviceSerialNumber;
  return typeof serial === "string" && serial ? serial : null;
};

// Access is bound only when every active grant is; one unbound grant allows any device
export const getBoundSerialNumbers = (grants: { attributes?: unknown }[]) => {
  const serials = grants.map((grant) => getGrantDeviceSerialNumber(grant.attributes));
  if (!serials.length || serials.some((serial) => !serial)) return null;
  return [...new Set(serials as string[])];
};

const CLI_UPGRADE_HINT = "If the Infisical CLI doesn't offer a device check, update it to the latest version.";

const requireVerification = (accountId: string, accessType: PamAccessType, message: string) =>
  new ForbiddenRequestError({
    name: PamDevicePostureErrorCode.VerificationRequired,
    message,
    details: { code: PamDevicePostureErrorCode.VerificationRequired, accountId, accessType }
  });

export const enforceDevicePosture = async (
  { pamDeviceVerificationDAL }: { pamDeviceVerificationDAL: Pick<TPamDeviceVerificationDALFactory, "findById"> },
  {
    account,
    accessType = PamAccessType.Session,
    deviceVerificationId,
    boundSerialNumbers,
    actorType,
    actorId
  }: {
    account: { id: string; templatePolicies: unknown };
    accessType?: PamAccessType;
    deviceVerificationId?: string | null;
    boundSerialNumbers?: string[] | null;
    actorType: ActorType;
    actorId: string;
  }
) => {
  const templatePolicy = resolveAccessControls(account.templatePolicies).devicePosture;
  if (!templatePolicy && !boundSerialNumbers?.length) return null;

  if (actorType !== ActorType.USER) {
    throw new ForbiddenRequestError({
      message:
        "This account requires a device check, which machine identities can't do. Remove Require Device Posture from the account's template to allow machine identity access."
    });
  }

  const message = boundSerialNumbers?.length
    ? "This access was approved for one device. Check this device with the Infisical CLI to continue."
    : "This account requires a device check. Check this device with the Infisical CLI to continue.";
  if (!deviceVerificationId) throw requireVerification(account.id, accessType, `${message} ${CLI_UPGRADE_HINT}`);

  const row = await pamDeviceVerificationDAL.findById(deviceVerificationId);
  if (!row || row.userId !== actorId) {
    throw requireVerification(account.id, accessType, `${message} The device check you sent wasn't found.`);
  }
  if (row.accountId !== account.id || (row.accessType ?? PamAccessType.Session) !== accessType) {
    throw requireVerification(
      account.id,
      accessType,
      `${message} The device check you sent was for another account or action.`
    );
  }
  const isFresh =
    row.completedAt && Date.now() - new Date(row.completedAt).getTime() <= PAM_DEVICE_VERIFICATION_VALIDITY_MS;
  if (!isFresh) {
    throw requireVerification(account.id, accessType, `${message} The device check you sent has expired.`);
  }

  if (row.status !== PamDeviceVerificationStatus.Passed) {
    throw new ForbiddenRequestError({
      message: "This device doesn't meet the account's device posture policy.",
      name: PamDevicePostureErrorCode.PostureFailed,
      details: { code: PamDevicePostureErrorCode.PostureFailed, verification: toVerificationResponse(row) }
    });
  }
  if (boundSerialNumbers?.length && !boundSerialNumbers.includes(row.deviceSerialNumber ?? "")) {
    throw new ForbiddenRequestError({
      message: `This access was approved for the device with serial ${boundSerialNumbers.join(" or ")}.`,
      name: PamDevicePostureErrorCode.PostureFailed,
      details: { code: PamDevicePostureErrorCode.PostureFailed, verification: toVerificationResponse(row) }
    });
  }
  return row;
};

export const pamDevicePostureServiceFactory = ({
  pamDeviceVerificationDAL,
  pamAccountDAL,
  pamPermissionService,
  projectPermissionService,
  approvalPolicyDAL,
  approvalPolicyService,
  autoApprovalService,
  appConnectionDAL,
  kmsDataKeyService,
  userDAL
}: TPamDevicePostureServiceFactoryDep) => {
  const assertUser = (actor: TActorContext) => {
    if (actor.principal.type !== ActorType.USER) {
      throw new ForbiddenRequestError({ message: "Only users can check a device. Machine identities have no device." });
    }
  };

  const loadAccount = async (accountId: string, projectId: string) => {
    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) throw new NotFoundError({ message: "Account not found" });
    return { ...account, projectId };
  };

  const accountPath = (account: { name: string; folderName?: string | null }) =>
    account.folderName ? `${account.folderName}/${account.name}` : account.name;

  const getAutoApprovalPolicies = async (
    account: Awaited<ReturnType<typeof loadAccount>>
  ): Promise<TPamDevicePosturePolicy[]> => {
    if (!account.folderId || !resolveAccessControls(account.templatePolicies).allowAutoApproval) return [];
    const [policy] = await approvalPolicyDAL.findByProjectId(ApprovalPolicyType.PamAccess, account.projectId, {
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeId: account.folderId
    });
    if (!policy) return [];
    const stored = (await autoApprovalService.findByPolicyIds([policy.id])).get(policy.id);
    return (stored?.rules ?? []).flatMap((rule) =>
      rule.conditions.flatMap((condition) =>
        isDevicePostureCondition(condition) && condition.devicePosture ? [condition.devicePosture] : []
      )
    );
  };

  const findBoundSerialNumbers = async (
    account: { id: string; projectId: string; folderId?: string | null },
    userId: string,
    accessType: PamAccessType
  ) => {
    if (!account.folderId) return null;
    const grants = await approvalPolicyService.getActiveGrants(
      ApprovalPolicyType.PamAccess,
      account.projectId,
      { id: userId, type: ActorType.USER },
      { accountId: account.id, folderId: account.folderId, accessType }
    );
    return getBoundSerialNumbers(grants);
  };

  const lookupFacts = async (
    policies: TPamDevicePosturePolicy[],
    serialNumber: string,
    email: string | null
  ): Promise<TDevicePostureFacts> => {
    const connectionIds = [
      ...new Map(policies.flatMap((policy) => policy.providers).map((p) => [p.connectionId, p])).values()
    ];
    const facts: TDevicePostureFacts = {};

    await Promise.all(
      connectionIds.map(async (config) => {
        try {
          const raw = await appConnectionDAL.findById(config.connectionId);
          if (!raw || raw.app !== AppConnection.Rippling) {
            facts[config.connectionId] = { error: "The Rippling connection for this check is no longer available." };
            return;
          }
          if (config.provider === PamDevicePostureProvider.Rippling) {
            const connection = (await decryptAppConnection(raw, kmsDataKeyService)) as TRipplingConnection;
            const [device, worker] = await Promise.all([
              getRipplingDeviceBySerial(connection, serialNumber),
              email ? getRipplingWorkerByEmail(connection, email) : Promise.resolve(null)
            ]);
            facts[config.connectionId] = { facts: toRipplingDeviceFacts({ serial: serialNumber, device, worker }) };
          }
        } catch (error) {
          if (!(error instanceof BadRequestError)) {
            logger.error(error, `Device posture lookup failed [connectionId=${config.connectionId}]`);
          }
          facts[config.connectionId] = {
            error:
              error instanceof BadRequestError
                ? `Couldn't check this device with Rippling: ${error.message}`
                : "Infisical couldn't reach Rippling to check this device. Try again in a few minutes, or contact your admin if it keeps happening."
          };
        }
      })
    );

    return facts;
  };

  const evaluate = async ({
    account,
    userId,
    accessType,
    forAutoApproval,
    device
  }: {
    account: Awaited<ReturnType<typeof loadAccount>>;
    userId: string;
    accessType: PamAccessType;
    forAutoApproval: boolean;
    device: TPamDeviceInfo;
  }) => {
    const templatePolicy = resolveAccessControls(account.templatePolicies).devicePosture;
    const autoApprovalPolicies = forAutoApproval ? await getAutoApprovalPolicies(account) : [];
    const boundSerialNumbers = await findBoundSerialNumbers(account, userId, accessType);
    const user = await userDAL.findById(userId);
    const email = (user?.email ?? user?.username ?? null)?.toLowerCase() ?? null;

    const policies = [templatePolicy, ...autoApprovalPolicies].filter((policy): policy is TPamDevicePosturePolicy =>
      Boolean(policy)
    );
    const facts = await lookupFacts(policies, device.serialNumber, email);
    // Without a template policy, the check passes when any device rule would, so a rule later in the list still applies
    const autoApprovalResults = autoApprovalPolicies.map((policy) => ({
      policy,
      result: evaluateDevicePosture(policy, facts)
    }));
    const primary =
      templatePolicy ??
      autoApprovalResults.find(({ result }) => result.passed)?.policy ??
      autoApprovalPolicies[0] ??
      null;

    let status = PamDeviceVerificationStatus.Passed;
    let message: string | null = null;
    const checks: TPamDevicePostureCheckResult[] = [];

    if (primary) {
      const result = evaluateDevicePosture(primary, facts);
      checks.push(...result.checks);
      if (result.error) {
        status = PamDeviceVerificationStatus.Error;
        message = result.error;
      } else if (!result.passed) {
        status = PamDeviceVerificationStatus.Failed;
      }
    }

    if (boundSerialNumbers && status !== PamDeviceVerificationStatus.Error) {
      const matches = boundSerialNumbers.includes(device.serialNumber);
      checks.push({
        provider: "Infisical",
        check: PamDevicePostureCheck.ApprovedDevice,
        label: PAM_DEVICE_POSTURE_CHECK_LABELS[PamDevicePostureCheck.ApprovedDevice],
        passed: matches,
        detail: matches
          ? "This is the device the request was approved for."
          : `Access was approved for the device with serial ${boundSerialNumbers.join(" or ")}.`
      });
      if (!matches) status = PamDeviceVerificationStatus.Failed;
    }

    const appliesTo: PamDevicePostureScope[] = [];
    if (templatePolicy || boundSerialNumbers) appliesTo.push(PamDevicePostureScope.Template);
    if (autoApprovalPolicies.length) appliesTo.push(PamDevicePostureScope.AutoApproval);

    return {
      appliesTo,
      providers: getDevicePostureProviderNames(primary),
      update: {
        status,
        message,
        checks: JSON.stringify(checks),
        facts: JSON.stringify(facts),
        device: JSON.stringify(describeDevice(facts, device.serialNumber)),
        deviceSerialNumber: device.serialNumber,
        completedAt: new Date()
      }
    };
  };

  const assertAccountPermission = async (
    account: Awaited<ReturnType<typeof loadAccount>>,
    accessType: PamAccessType,
    actor: TActorContext
  ) => {
    await verifyProductMembership(projectPermissionService, account.projectId, actor);
    await checkAccountAccess(
      pamPermissionService,
      account.id,
      account.folderId,
      account.projectId,
      accessType === PamAccessType.Credential
        ? PamResourcePermissionActions.ViewCredentials
        : PamResourcePermissionActions.LaunchSessions,
      actor
    );
  };

  const createVerification = async ({
    projectId,
    accountId,
    accessType = PamAccessType.Session,
    forAutoApproval = false,
    actor
  }: {
    projectId: string;
    accountId: string;
    accessType?: PamAccessType;
    forAutoApproval?: boolean;
    actor: TActorContext;
  }) => {
    assertUser(actor);
    const account = await loadAccount(accountId, projectId);
    await assertAccountPermission(account, accessType, actor);

    const createTicket = async (attempt: number): Promise<{ id: string; code: string; expiresAt: Date }> => {
      try {
        const row = await pamDeviceVerificationDAL.create({
          projectId,
          accountId,
          userId: actor.principal.id,
          code: generateCode(),
          accessType,
          forAutoApproval,
          status: PamDeviceVerificationStatus.Pending,
          expiresAt: new Date(Date.now() + PAM_DEVICE_VERIFICATION_CODE_TTL_MS)
        });
        return { id: row.id, code: row.code as string, expiresAt: row.expiresAt };
      } catch (error) {
        const isCodeCollision =
          error instanceof DatabaseError &&
          (error.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation;
        if (isCodeCollision && attempt < 3) return createTicket(attempt + 1);
        throw error;
      }
    };
    return createTicket(1);
  };

  const checkDevice = async ({
    projectId,
    accountId,
    accessType = PamAccessType.Session,
    forAutoApproval = false,
    device,
    actor
  }: {
    projectId: string;
    accountId: string;
    accessType?: PamAccessType;
    forAutoApproval?: boolean;
    device: TPamDeviceInfo;
    actor: TActorContext;
  }) => {
    assertUser(actor);
    const account = await loadAccount(accountId, projectId);
    await assertAccountPermission(account, accessType, actor);

    const result = await evaluate({ account, userId: actor.principal.id, accessType, forAutoApproval, device });
    if (!result.appliesTo.length) return { verification: null, appliesTo: result.appliesTo, account };

    const row = await pamDeviceVerificationDAL.create({
      projectId,
      accountId,
      userId: actor.principal.id,
      accessType,
      forAutoApproval,
      expiresAt: result.update.completedAt,
      ...result.update
    });
    return {
      verification: toVerificationResponse(row, { accountName: accountPath(account), providers: result.providers }),
      appliesTo: result.appliesTo,
      account,
      row
    };
  };

  const completeVerification = async ({
    projectId,
    code,
    device,
    actor
  }: {
    projectId: string;
    code: string;
    device: TPamDeviceInfo;
    actor: TActorContext;
  }) => {
    assertUser(actor);
    const row = await pamDeviceVerificationDAL.findOne({ code: code.trim().toUpperCase(), projectId });
    if (!row) throw new NotFoundError({ message: "No pending device verification matches that code." });
    if (row.userId !== actor.principal.id) {
      throw new ForbiddenRequestError({
        message: "That code was started by another user. Start again from your browser."
      });
    }
    if (row.status !== PamDeviceVerificationStatus.Pending) {
      throw new ConflictError({ message: "That code was already used. Start again from your browser." });
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      throw new BadRequestError({ message: "That code expired. Start again from your browser." });
    }

    const account = await loadAccount(row.accountId, projectId);
    await assertAccountPermission(account, row.accessType as PamAccessType, actor);
    const result = await evaluate({
      account,
      userId: actor.principal.id,
      accessType: row.accessType as PamAccessType,
      forAutoApproval: row.forAutoApproval,
      device
    });

    const updated = await pamDeviceVerificationDAL.transaction(async (tx) => {
      const claimed = await pamDeviceVerificationDAL.update(
        { id: row.id, status: PamDeviceVerificationStatus.Pending },
        result.update,
        tx
      );
      if (!claimed.length) {
        throw new ConflictError({ message: "That code was already used. Start again from your browser." });
      }
      return claimed[0];
    });

    return {
      verification: toVerificationResponse(updated, { accountName: accountPath(account), providers: result.providers }),
      account,
      row: updated
    };
  };

  const getVerification = async ({
    projectId,
    verificationId,
    actor
  }: {
    projectId: string;
    verificationId: string;
    actor: TActorContext;
  }) => {
    assertUser(actor);
    const row = await pamDeviceVerificationDAL.findById(verificationId);
    if (!row || row.projectId !== projectId || row.userId !== actor.principal.id) {
      throw new NotFoundError({ message: "Device verification not found" });
    }
    return toVerificationResponse(row);
  };

  const enforce = async ({
    account,
    accessType = PamAccessType.Session,
    deviceVerificationId,
    actor
  }: {
    account: { id: string; templatePolicies: unknown; projectId?: string | null; folderId?: string | null };
    accessType?: PamAccessType;
    deviceVerificationId?: string | null;
    actor: TActorContext;
  }) => {
    const isUser = actor.principal.type === ActorType.USER;
    const boundSerialNumbers =
      isUser && account.projectId && resolveAccessControls(account.templatePolicies).requiresApproval
        ? await findBoundSerialNumbers(
            { id: account.id, projectId: account.projectId, folderId: account.folderId },
            actor.principal.id,
            accessType
          )
        : null;
    return enforceDevicePosture(
      { pamDeviceVerificationDAL },
      {
        account,
        accessType,
        deviceVerificationId,
        boundSerialNumbers,
        actorType: actor.principal.type,
        actorId: actor.principal.id
      }
    );
  };

  return { createVerification, checkDevice, completeVerification, getVerification, enforce };
};
