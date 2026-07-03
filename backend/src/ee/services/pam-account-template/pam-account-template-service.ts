import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { PamAccountType, PamProductRole } from "../pam/pam-enums";
import { TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { validatePolicyValues } from "../pam/pam-policies";
import {
  mintCorsProbeUrl,
  TPamValidatorDeps,
  validateGatewayAttachment,
  validateRecordingConnection,
  validateRecordingS3Config
} from "../pam/pam-validators";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { ACCOUNT_TYPE_CONFIGS } from "../pam-account/pam-account-schemas";
import { isRotatableAccountType, ROTATABLE_ACCOUNT_TYPES } from "../pam-account-rotation/pam-rotation-fns";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { TPamRecordingResolvedConfig } from "../pam-session-recording/pam-recording-storage-types";
import { TPamAccountTemplateDALFactory } from "./pam-account-template-dal";
import {
  PamRecordingS3ConfigSchema,
  PamTemplateSettingsSchema,
  TPamTemplateSettings
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
  pamAccountDAL: Pick<TPamAccountDALFactory, "reconcileRotationScheduleForTemplate">;
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
  const validateTemplateRotationConfig = (accountType: string, settings: TPamTemplateSettings | undefined) => {
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
  };

  const verifyProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await verifyMembership(projectId, ctx);
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const validateTemplateRecordingS3Config = async (
    recordingConnectionId: string | null | undefined,
    settings: TPamTemplateSettings | undefined,
    ctx: TActorContext
  ): Promise<TPamRecordingResolvedConfig | null> => {
    const isS3Backend = settings?.recordingStorageBackend === PamRecordingStorageBackend.AwsS3;

    let resolvedS3Config = null;
    if (recordingConnectionId && settings) {
      const s3Parsed = PamRecordingS3ConfigSchema.safeParse(settings.recordingS3Config);
      if (s3Parsed.success) {
        resolvedS3Config = await validateRecordingS3Config(deps, recordingConnectionId, s3Parsed.data, ctx);
      }
    }

    if (isS3Backend && (!recordingConnectionId || !resolvedS3Config)) {
      throw new BadRequestError({
        message: "S3 storage backend requires an AWS connection and valid S3 bucket configuration"
      });
    }

    return resolvedS3Config;
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

    const { accountCount, ...rotationImpact } = await pamAccountTemplateDAL.getTemplateRotationStats(templateId);
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
    const validatedPolicies = validateTemplatePolicies(type, policies);
    validateTemplateRotationConfig(type, settings);

    const resolvedS3Config = await validateTemplateRecordingS3Config(recordingConnectionId, settings, ctx);

    try {
      const template = await pamAccountTemplateDAL.create({
        projectId,
        name,
        description,
        type,
        policies: validatedPolicies,
        settings: settings ?? undefined,
        gatewayId,
        gatewayPoolId,
        recordingConnectionId
      });
      const corsProbeUrl = resolvedS3Config ? await mintCorsProbeUrl(resolvedS3Config) : null;
      return { ...template, corsProbeUrl };
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A template named "${name}" already exists` });
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
    await validateGatewayAttachment(deps, gatewayId, gatewayPoolId, ctx);
    await validateRecordingConnection(deps, recordingConnectionId, ctx);

    const existing = await pamAccountTemplateDAL.findById(templateId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const validatedPolicies = validateTemplatePolicies(existing.type, policies);
    validateTemplateRotationConfig(existing.type, settings);

    const resolvedConnId = recordingConnectionId !== undefined ? recordingConnectionId : existing.recordingConnectionId;
    const resolvedSettings = (settings !== undefined ? settings : existing.settings) as TPamTemplateSettings;

    const resolvedS3Config = await validateTemplateRecordingS3Config(resolvedConnId, resolvedSettings, ctx);

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
        }
        return updated;
      });
      const corsProbeUrl = resolvedS3Config ? await mintCorsProbeUrl(resolvedS3Config) : null;
      return { ...template, corsProbeUrl };
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A template named "${name}" already exists` });
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
