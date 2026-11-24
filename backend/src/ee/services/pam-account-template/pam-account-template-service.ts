import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { isRotatableAccountType, ROTATABLE_ACCOUNT_TYPES } from "../pam-account-rotation/pam-rotation-fns";
import { ORACLE_MAX_PASSWORD_LENGTH } from "../pam-account/pam-account-connection-test";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { ACCOUNT_TYPE_CONFIGS } from "../pam-account/pam-account-schemas";
import {
  describeRecordingConnectionApps,
  isExternalRecordingBackend,
  PAM_RECORDING_BACKEND_DETAILS
} from "../pam-session-recording/pam-recording-backends";
import { getRecordingLocation } from "../pam-session-recording/pam-recording-config-fns";
import { TPamRecordingResolvedConfig } from "../pam-session-recording/pam-recording-storage-types";
import { accountTypeSupportsSessionLogMasking, PamAccountType, PamProductRole } from "../pam/pam-enums";
import { TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { defaultTemplatePolicies, validatePolicyValues } from "../pam/pam-policies";
import {
  mintCorsProbeUrl,
  TPamValidatorDeps,
  validateGatewayAttachment,
  validateRecordingConnection,
  validateRecordingStorageConfig
} from "../pam/pam-validators";
import { TPamAccountTemplateDALFactory } from "./pam-account-template-dal";
import {
  DEFAULT_HEARTBEAT_CONFIG,
  PamTemplateSettingsSchema,
  TPamTemplateSettings,
  TPamTemplateSettingsInput
} from "./pam-account-template-schemas";
import {
  TCreatePamAccountTemplateDTO,
  TDeletePamAccountTemplateDTO,
  TGetPamAccountTemplateDTO,
  TListPamAccountTemplatesDTO,
  TUpdatePamAccountTemplateDTO
} from "./pam-account-template-types";

const SUPPORTED_ACCOUNT_TYPES = new Set<string>(Object.keys(ACCOUNT_TYPE_CONFIGS));

// Symbols a rotation password may use: printable punctuation minus anything that could terminate a quoted SQL
// string, escape it, separate a statement, or be read as a knex positional binding (' " \ ` ; ?).
const SAFE_PASSWORD_SYMBOLS = "!@#$%^&*()-_=+[]{}|:,.<>/~";

type TPamAccountTemplateServiceFactoryDep = TPamValidatorDeps & {
  pamAccountTemplateDAL: TPamAccountTemplateDALFactory;
  pamAccountDAL: Pick<
    TPamAccountDALFactory,
    | "reconcileRotationScheduleForTemplate"
    | "reconcileHeartbeatScheduleForTemplate"
    | "findRecordingConnectionOverridesByTemplateId"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
};

export type TPamAccountTemplateServiceFactory = ReturnType<typeof pamAccountTemplateServiceFactory>;

export const pamAccountTemplateServiceFactory = (deps: TPamAccountTemplateServiceFactoryDep) => {
  const { pamAccountTemplateDAL, pamAccountDAL, permissionService } = deps;

  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  const validateTemplatePolicies = (accountType: string, policies: unknown): Record<string, unknown> | undefined => {
    if (!policies || typeof policies !== "object") return undefined;
    const result = validatePolicyValues(accountType as PamAccountType, policies as Record<string, unknown>);
    if (!result.ok) throw new BadRequestError({ message: result.message });
    return result.data;
  };

  // Reject rotation config on non-rotatable template types (the settings schema can't, since the type is a sibling
  // field). The supported-type list is derived from the registry so it never goes stale as types are added.
  const validateTemplateRotationConfig = (accountType: string, settings: TPamTemplateSettingsInput | undefined) => {
    if (!settings) return;
    const hasRotationConfig = settings.rotation !== undefined || settings.passwordRequirements !== undefined;
    if (hasRotationConfig && !isRotatableAccountType(accountType)) {
      const supported = ROTATABLE_ACCOUNT_TYPES.map((type) => ACCOUNT_TYPE_CONFIGS[type].name).join(", ");
      throw new BadRequestError({ message: `Credential rotation is only supported for ${supported} accounts` });
    }
    // allowedSymbols end up interpolated into the quoted password-change statement, so validate against an
    // allowlist rather than a denylist: an allowlist rejects anything not explicitly permitted, so a breakout
    // character can never slip through unlisted.
    const allowedSymbols = settings.passwordRequirements?.allowedSymbols;
    if (allowedSymbols) {
      const invalid = [...new Set(allowedSymbols)].filter((char) => !SAFE_PASSWORD_SYMBOLS.includes(char));
      if (invalid.length > 0) {
        throw new BadRequestError({ message: `Allowed symbols may only include: ${SAFE_PASSWORD_SYMBOLS}` });
      }
    }
    const requestedLength = settings.passwordRequirements?.length;
    if (
      accountType === PamAccountType.OracleDB &&
      requestedLength !== undefined &&
      requestedLength > ORACLE_MAX_PASSWORD_LENGTH
    ) {
      throw new BadRequestError({
        message: `Oracle passwords are limited to ${ORACLE_MAX_PASSWORD_LENGTH} characters, so a template cannot request a longer one`
      });
    }
  };

  const verifyProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await verifyMembership(projectId, ctx);
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const validateTemplateRecordingConfig = async (
    recordingConnectionId: string | null | undefined,
    settings: TPamTemplateSettingsInput | undefined,
    ctx: TActorContext
  ): Promise<TPamRecordingResolvedConfig | null> => {
    const backend = settings?.recordingStorageBackend;
    if (!isExternalRecordingBackend(backend)) return null;

    const location = getRecordingLocation(backend, null, settings);
    if (!recordingConnectionId || !location) {
      throw new BadRequestError({
        message: `Storing recordings in ${PAM_RECORDING_BACKEND_DETAILS[backend].name} requires ${describeRecordingConnectionApps(backend)} and a valid ${PAM_RECORDING_BACKEND_DETAILS[backend].locationName} configuration`
      });
    }

    return validateRecordingStorageConfig(deps, recordingConnectionId, location, ctx);
  };

  const list = async ({ projectId, search, type, ...ctx }: TListPamAccountTemplatesDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);
    const templates = await pamAccountTemplateDAL.findByProjectId(projectId, { search, type });
    return templates.filter((template) => SUPPORTED_ACCOUNT_TYPES.has(template.type));
  };

  const getById = async ({ templateId, projectId, ...ctx }: TGetPamAccountTemplateDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);

    const template = await pamAccountTemplateDAL.findById(templateId);
    if (!template || template.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const { accountCount, ...stats } = await pamAccountTemplateDAL.getTemplateRotationStats(templateId);
    // rotationImpact only means something for rotatable types; a non-rotatable template rotates nothing regardless.
    const rotationImpact = isRotatableAccountType(template.type) ? stats : { willRotate: 0, needsRotationAccount: 0 };
    return { ...template, accountCount, rotationImpact };
  };

  const create = async ({
    projectId,
    name,
    description,
    type,
    policies,
    settings,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TCreatePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);
    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);
    await validateRecordingConnection(deps, recordingConnectionId, ctx);
    const validatedPolicies = validateTemplatePolicies(type, policies ?? defaultTemplatePolicies(type));
    validateTemplateRotationConfig(type, settings);

    const resolvedRecordingConfig = await validateTemplateRecordingConfig(recordingConnectionId, settings, ctx);

    // Credential health checking and built-in masking are on for a new template unless the caller
    // says otherwise.
    // Partial on purpose: the schema's defaults are applied on read, exactly as they were when create stored
    // no settings at all.
    const seededSettings: Partial<TPamTemplateSettings> = {
      ...(settings ?? {}),
      heartbeat: settings?.heartbeat ?? DEFAULT_HEARTBEAT_CONFIG,
      sessionLogMaskingBuiltInDetection:
        settings?.sessionLogMaskingBuiltInDetection ?? accountTypeSupportsSessionLogMasking(type)
    };

    try {
      const template = await pamAccountTemplateDAL.create({
        projectId,
        name,
        description,
        type,
        policies: validatedPolicies,
        settings: seededSettings,
        gatewayId,
        gatewayPoolId,
        recordingConnectionId
      });
      const corsProbeUrl = resolvedRecordingConfig ? await mintCorsProbeUrl(resolvedRecordingConfig) : null;
      return { ...template, corsProbeUrl };
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `An account template named "${name}" already exists in this project` });
      }
      throw err;
    }
  };

  const update = async ({
    templateId,
    projectId,
    name,
    description,
    policies,
    settings,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TUpdatePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    const existing = await pamAccountTemplateDAL.findById(templateId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx, {
      previousGatewayId: existing.gatewayId
    });
    await validateRecordingConnection(deps, recordingConnectionId, ctx);

    const validatedPolicies = validateTemplatePolicies(existing.type, policies);
    validateTemplateRotationConfig(existing.type, settings);

    const resolvedConnId = recordingConnectionId !== undefined ? recordingConnectionId : existing.recordingConnectionId;
    const resolvedSettings = (settings !== undefined ? settings : existing.settings) as TPamTemplateSettings;

    // Accounts with their own connection keep it, so it has to be able to write to the template's new storage
    const nextBackend = resolvedSettings?.recordingStorageBackend;
    if (isExternalRecordingBackend(nextBackend)) {
      const { name: storeName, connectionApps } = PAM_RECORDING_BACKEND_DETAILS[nextBackend];
      const incompatible = (await pamAccountDAL.findRecordingConnectionOverridesByTemplateId(templateId)).filter(
        (account) => !connectionApps.includes(account.app as AppConnection)
      );
      if (incompatible.length) {
        const names = incompatible
          .slice(0, 5)
          .map((account) => `'${account.name}'`)
          .join(", ");
        throw new BadRequestError({
          message: `Accounts ${names}${incompatible.length > 5 ? ` and ${incompatible.length - 5} more` : ""} use their own recording connection, which can't store recordings in ${storeName}. Remove their recording override or give them ${describeRecordingConnectionApps(nextBackend)} first.`
        });
      }
    }

    const resolvedRecordingConfig = await validateTemplateRecordingConfig(resolvedConnId, resolvedSettings, ctx);

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (policies !== undefined) updateData.policies = validatedPolicies;
    if (settings !== undefined) updateData.settings = settings;
    if (gatewayId !== undefined) updateData.gatewayId = gatewayId;
    if (gatewayPoolId !== undefined) updateData.gatewayPoolId = gatewayPoolId;
    if (recordingConnectionId !== undefined) updateData.recordingConnectionId = recordingConnectionId;

    try {
      // Write the template and re-derive its accounts' schedules atomically, so a crash can't leave the settings
      // changed but nextRotationAt stale. Recompute already-scheduled accounts only when the interval changed.
      const template = await pamAccountTemplateDAL.transaction(async (tx) => {
        const updated = await pamAccountTemplateDAL.updateById(templateId, updateData, tx);
        if (settings !== undefined) {
          const oldInterval = PamTemplateSettingsSchema.safeParse(existing.settings).data?.rotation?.intervalSeconds;
          const newInterval = PamTemplateSettingsSchema.safeParse(settings).data?.rotation?.intervalSeconds;
          await pamAccountDAL.reconcileRotationScheduleForTemplate(
            templateId,
            { rescheduleReady: newInterval !== undefined && oldInterval !== newInterval },
            tx
          );

          const oldHeartbeat = PamTemplateSettingsSchema.safeParse(existing.settings).data?.heartbeat;
          const newHeartbeat = PamTemplateSettingsSchema.safeParse(settings).data?.heartbeat;
          await pamAccountDAL.reconcileHeartbeatScheduleForTemplate(
            templateId,
            { rescheduleAll: oldHeartbeat?.intervalSeconds !== newHeartbeat?.intervalSeconds },
            tx
          );
        }
        return updated;
      });
      const corsProbeUrl = resolvedRecordingConfig ? await mintCorsProbeUrl(resolvedRecordingConfig) : null;
      return { ...template, corsProbeUrl };
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `An account template named "${name}" already exists in this project` });
      }
      throw err;
    }
  };

  const deleteTemplate = async ({ templateId, projectId, ...ctx }: TDeletePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    const existing = await pamAccountTemplateDAL.findById(templateId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const accountCount = await pamAccountTemplateDAL.countAccountsByTemplateId(templateId);
    if (accountCount > 0) {
      throw new BadRequestError({
        message: `Cannot delete template "${existing.name}" because ${accountCount} account(s) still reference it`
      });
    }

    return pamAccountTemplateDAL.deleteById(templateId);
  };

  return { list, getById, create, update, deleteTemplate };
};
