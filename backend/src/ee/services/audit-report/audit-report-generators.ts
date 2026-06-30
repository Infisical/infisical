import picomatch from "picomatch";
import { z } from "zod";

import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TReminderDALFactory } from "@app/services/reminder/reminder-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { containsSecretReference } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretValidationRuleDALFactory } from "@app/services/secret-validation-rule/secret-validation-rule-dal";
import { evaluateStaticSecretConstraints } from "@app/services/secret-validation-rule/secret-validation-rule-fns";
import { parseSecretValidationRuleInputs } from "@app/services/secret-validation-rule/secret-validation-rule-schemas";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-types";

import { buildFolderPathMap, DAY_IN_MS, daysSince } from "./audit-report-fns";
import { AuditReportType, MAX_AUDIT_REPORT_ROWS, TGeneratedReport, TReportRow } from "./audit-report-types";

export type TAuditReportGeneratorDALs = {
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "findStaleByProject" | "findDuplicatedSecretValues" | "findValueValidationCandidatesByProject"
  >;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "findByProjectAndDateRange" | "findByProject">;
  reminderDAL: Pick<TReminderDALFactory, "findByProjectAndDateRange">;
  auditLogDAL: Pick<TAuditLogDALFactory, "find">;
  secretValidationRuleDAL: Pick<TSecretValidationRuleDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TReportGenerationContext = {
  projectId: string;
  orgId: string;
  dal: TAuditReportGeneratorDALs;
};

// A report definition. `inputsSchema` is the single source of truth for that report's inputs: the service
// validates request inputs against it, and each `run` re-parses with the same (concrete) schema to apply
// defaults/coercion. Input types stay precise because every `run` owns its concrete schema.
export type TReportDefinition = {
  type: AuditReportType;
  label: string;
  inputsSchema: z.ZodTypeAny;
  run: (ctx: TReportGenerationContext, rawInputs: unknown) => Promise<TGeneratedReport>;
};

// Cap a fully-materialized result set at the row ceiling, reporting truncation.
const applyRowCap = <T>(items: T[]): { items: T[]; truncated: boolean } => {
  if (items.length > MAX_AUDIT_REPORT_ROWS) {
    return { items: items.slice(0, MAX_AUDIT_REPORT_ROWS), truncated: true };
  }
  return { items, truncated: false };
};

const ROTATION_COLUMNS = [
  "rotationName",
  "secretKeys",
  "environment",
  "secretPath",
  "nextRotationAt",
  "rotationStatus",
  "rotationInterval"
];

type TRotation = Awaited<ReturnType<TSecretRotationV2DALFactory["findByProject"]>>[number];

const mapRotations = (rotations: TRotation[]): TGeneratedReport => {
  const { items, truncated } = applyRowCap(rotations);
  return {
    columns: ROTATION_COLUMNS,
    truncated,
    rows: items.map((rotation) => ({
      rotationName: rotation.name,
      secretKeys: rotation.secretKeys.join(";"),
      environment: rotation.environment.slug,
      secretPath: rotation.folder.path,
      nextRotationAt: rotation.nextRotationAt ? rotation.nextRotationAt.toISOString() : null,
      rotationStatus: rotation.rotationStatus ?? null,
      rotationInterval: rotation.rotationInterval
    }))
  };
};

const REMINDER_COLUMNS = ["secretKey", "environment", "secretPath", "nextReminderDate", "message"];

type TReminder = Awaited<ReturnType<TReminderDALFactory["findByProjectAndDateRange"]>>[number];

const mapReminders = async (
  dal: TAuditReportGeneratorDALs,
  projectId: string,
  reminders: TReminder[]
): Promise<TGeneratedReport> => {
  const { items, truncated } = applyRowCap(reminders);
  const folderPathMap = await buildFolderPathMap(
    dal.folderDAL,
    projectId,
    items.map((reminder) => reminder.folderId)
  );
  return {
    columns: REMINDER_COLUMNS,
    truncated,
    rows: items.map((reminder) => ({
      secretKey: reminder.secretKey,
      environment: reminder.envSlug,
      secretPath: folderPathMap[reminder.folderId] ?? "/",
      nextReminderDate: new Date(reminder.nextReminderDate).toISOString(),
      message: reminder.message ?? null
    }))
  };
};

// ─── Secret access log helpers ──────────────────────────────────────────────────

const SECRET_ACCESS_EVENT_TYPES = [
  EventType.GET_SECRETS,
  EventType.GET_SECRET,
  EventType.DASHBOARD_GET_SECRET_VALUE,
  EventType.CREATE_SECRET,
  EventType.CREATE_SECRETS,
  EventType.UPDATE_SECRET,
  EventType.UPDATE_SECRETS,
  EventType.DELETE_SECRET,
  EventType.DELETE_SECRETS
];

const ActorMetadataSchema = z
  .object({ name: z.string(), email: z.string(), username: z.string(), identityId: z.string() })
  .partial()
  .passthrough();

const EventMetadataSchema = z
  .object({ secretKey: z.string(), environment: z.string(), secretPath: z.string() })
  .partial()
  .passthrough();

const parseRecord = <T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T => {
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
};

// ─── Input schemas ──────────────────────────────────────────────────────────────

const NoInputsSchema = z.object({}).default({});
const StaleSecretsInputsSchema = z.object({ staleDays: z.number().int().min(1).max(3650).default(90) });
const DaysAheadInputsSchema = z.object({ daysAhead: z.number().int().min(1).max(365).default(7) });
const SecretAccessLogInputsSchema = z
  .object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional()
  })
  .transform((value) => {
    const toDate = value.toDate ?? new Date();
    const fromDate = value.fromDate ?? new Date(toDate.getTime() - 30 * DAY_IN_MS);
    return { fromDate, toDate };
  })
  .refine((value) => value.toDate >= value.fromDate, { message: "toDate must be on or after fromDate" })
  .refine((value) => value.toDate.getTime() - value.fromDate.getTime() <= 90 * DAY_IN_MS, {
    message: "Secret access log range cannot exceed 90 days"
  });

// ─── Definitions ────────────────────────────────────────────────────────────────

const staleSecretsReport: TReportDefinition = {
  type: AuditReportType.StaleSecrets,
  label: "Stale Secrets",
  inputsSchema: StaleSecretsInputsSchema,
  run: async ({ projectId, dal }, rawInputs) => {
    const { staleDays } = StaleSecretsInputsSchema.parse(rawInputs ?? {});
    const staleThreshold = new Date(Date.now() - staleDays * DAY_IN_MS);
    // Fetch one past the cap to detect truncation without a separate count query.
    const secrets = await dal.secretV2BridgeDAL.findStaleByProject(projectId, staleThreshold, {
      offset: 0,
      limit: MAX_AUDIT_REPORT_ROWS + 1
    });
    const { items, truncated } = applyRowCap(secrets);
    const folderPathMap = await buildFolderPathMap(
      dal.folderDAL,
      projectId,
      items.map((secret) => secret.folderId)
    );
    return {
      columns: ["secretKey", "environment", "secretPath", "lastUpdatedAt", "daysSinceUpdate"],
      truncated,
      rows: items.map((secret) => ({
        secretKey: secret.key,
        environment: secret.environment,
        secretPath: folderPathMap[secret.folderId] ?? "/",
        lastUpdatedAt: secret.updatedAt.toISOString(),
        daysSinceUpdate: daysSince(secret.updatedAt)
      }))
    };
  }
};

const duplicateSecretsReport: TReportDefinition = {
  type: AuditReportType.DuplicateSecrets,
  label: "Duplicate Secrets",
  inputsSchema: NoInputsSchema,
  run: async ({ projectId, dal }) => {
    const columns = ["groupId", "secretKey", "environment", "secretPath"];
    const groups = await dal.secretV2BridgeDAL.findDuplicatedSecretValues(projectId);
    if (!groups.length) return { columns, rows: [], truncated: false };

    const { decryptor } = await dal.kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const realGroups = groups.filter((group) => {
      const [firstSecret] = group.secrets;
      if (!firstSecret) return false;
      if (!firstSecret.encryptedValue) return true;
      const decryptedValue = decryptor({ cipherTextBlob: firstSecret.encryptedValue }).toString();
      return !containsSecretReference(decryptedValue);
    });

    const folderPathMap = await buildFolderPathMap(
      dal.folderDAL,
      projectId,
      realGroups.flatMap((group) => group.secrets.map((secret) => secret.folderId))
    );

    const rows: TReportRow[] = [];
    let truncated = false;
    realGroups.forEach((group, index) => {
      group.secrets.forEach((secret) => {
        if (rows.length >= MAX_AUDIT_REPORT_ROWS) {
          truncated = true;
          return;
        }
        rows.push({
          groupId: index + 1,
          secretKey: secret.key,
          environment: secret.environment,
          secretPath: folderPathMap[secret.folderId] ?? "/"
        });
      });
    });

    return { columns, rows, truncated };
  }
};

const secretValidationComplianceReport: TReportDefinition = {
  type: AuditReportType.SecretValidationCompliance,
  label: "Secret Validation Compliance Violations",
  inputsSchema: NoInputsSchema,
  run: async ({ projectId, dal }) => {
    const columns = ["secretKey", "environment", "secretPath", "ruleName", "constraintType", "violation"];

    // Only static-secret rules constrain stored secret values; generated-credential rule types are
    // enforced at generation time and have no stored value to scan here.
    const rules = await dal.secretValidationRuleDAL.find({
      projectId,
      isActive: true,
      type: SecretValidationRuleType.StaticSecrets
    });
    if (!rules.length) return { columns, rows: [], truncated: false };

    // The same SecretManager data key encrypts both rule inputs and secret values.
    const { decryptor } = await dal.kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const parsedRules = rules.map((rule) => ({
      name: rule.name,
      envId: rule.envId ?? null,
      secretPath: rule.secretPath,
      constraints: parseSecretValidationRuleInputs(
        rule.type,
        JSON.parse(decryptor({ cipherTextBlob: rule.encryptedInputs }).toString()) as unknown
      ).constraints
    }));

    const secrets = await dal.secretV2BridgeDAL.findValueValidationCandidatesByProject(projectId);
    if (!secrets.length) return { columns, rows: [], truncated: false };

    // Resolve each secret's folder path + environment so a rule's path (which may be a glob pattern,
    // not just an absolute path) can be matched against the secret's concrete location.
    const folders = await dal.folderDAL.findSecretPathByFolderIds(projectId, [
      ...new Set(secrets.map((secret) => secret.folderId))
    ]);
    const folderById: Record<string, { path: string; envId: string; envSlug: string }> = {};
    folders.forEach((folder) => {
      if (folder) {
        folderById[folder.id] = { path: folder.path, envId: folder.envId, envSlug: folder.environmentSlug };
      }
    });

    const rows: TReportRow[] = [];
    let truncated = false;

    for (const secret of secrets) {
      const folder = folderById[secret.folderId];
      if (!folder) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const coveringRules = parsedRules.filter(
        (rule) =>
          (!rule.envId || rule.envId === folder.envId) &&
          picomatch.isMatch(folder.path, rule.secretPath, { strictSlashes: false })
      );
      if (!coveringRules.length) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Decrypt once per covered secret, then evaluate it against every rule that covers it.
      const value = decryptor({ cipherTextBlob: secret.encryptedValue }).toString();

      for (const rule of coveringRules) {
        const violations = evaluateStaticSecretConstraints(rule.constraints, { key: secret.key, value });
        for (const violation of violations) {
          if (rows.length >= MAX_AUDIT_REPORT_ROWS) {
            truncated = true;
            break;
          }
          rows.push({
            secretKey: secret.key,
            environment: folder.envSlug,
            secretPath: folder.path,
            ruleName: rule.name,
            constraintType: violation.constraintLabel,
            violation: violation.message
          });
        }
        if (truncated) break;
      }
      if (truncated) break;
    }

    return { columns, rows, truncated };
  }
};

const upcomingRotationsReport: TReportDefinition = {
  type: AuditReportType.UpcomingRotations,
  label: "Upcoming Rotations",
  inputsSchema: DaysAheadInputsSchema,
  run: async ({ projectId, dal }, rawInputs) => {
    const { daysAhead } = DaysAheadInputsSchema.parse(rawInputs ?? {});
    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * DAY_IN_MS);
    const rotations = await dal.secretRotationV2DAL.findByProjectAndDateRange({ projectId, startDate: now, endDate });
    return mapRotations(rotations);
  }
};

const failedRotationsReport: TReportDefinition = {
  type: AuditReportType.FailedRotations,
  label: "Failed Rotations",
  inputsSchema: NoInputsSchema,
  run: async ({ projectId, dal }) => {
    const rotations = await dal.secretRotationV2DAL.findByProject(projectId);
    return mapRotations(rotations.filter((rotation) => rotation.rotationStatus === "failed"));
  }
};

const upcomingRemindersReport: TReportDefinition = {
  type: AuditReportType.UpcomingReminders,
  label: "Upcoming Reminders",
  inputsSchema: DaysAheadInputsSchema,
  run: async ({ projectId, dal }, rawInputs) => {
    const { daysAhead } = DaysAheadInputsSchema.parse(rawInputs ?? {});
    const now = new Date();
    const endDate = new Date(now.getTime() + daysAhead * DAY_IN_MS);
    const reminders = await dal.reminderDAL.findByProjectAndDateRange({ projectId, startDate: now, endDate });
    return mapReminders(
      dal,
      projectId,
      reminders.filter((reminder) => new Date(reminder.nextReminderDate) >= now)
    );
  }
};

const secretAccessLogReport: TReportDefinition = {
  type: AuditReportType.SecretAccessLog,
  label: "Secret Access Log",
  inputsSchema: SecretAccessLogInputsSchema,
  run: async ({ projectId, orgId, dal }, rawInputs) => {
    const { fromDate, toDate } = SecretAccessLogInputsSchema.parse(rawInputs ?? {});
    const logs = await dal.auditLogDAL.find({
      orgId,
      projectId,
      eventType: SECRET_ACCESS_EVENT_TYPES,
      startDate: fromDate.toISOString(),
      endDate: toDate.toISOString(),
      offset: 0,
      limit: MAX_AUDIT_REPORT_ROWS + 1
    });
    const { items, truncated } = applyRowCap(logs);

    return {
      columns: [
        "timestamp",
        "actorType",
        "actorName",
        "actorEmail",
        "eventType",
        "secretKey",
        "environment",
        "secretPath",
        "ipAddress"
      ],
      truncated,
      rows: items.map((log) => {
        const actorMetadata = parseRecord(ActorMetadataSchema, log.actorMetadata, {});
        const eventMetadata = parseRecord(EventMetadataSchema, log.eventMetadata, {});
        return {
          timestamp: log.createdAt.toISOString(),
          actorType: log.actor,
          actorName:
            actorMetadata.name ?? actorMetadata.username ?? actorMetadata.email ?? actorMetadata.identityId ?? "",
          actorEmail: actorMetadata.email ?? "",
          eventType: log.eventType,
          secretKey: eventMetadata.secretKey ?? "",
          environment: eventMetadata.environment ?? "",
          secretPath: eventMetadata.secretPath ?? "",
          ipAddress: log.ipAddress ?? ""
        };
      })
    };
  }
};

export const AUDIT_REPORT_DEFINITIONS: Record<AuditReportType, TReportDefinition> = {
  [AuditReportType.StaleSecrets]: staleSecretsReport,
  [AuditReportType.DuplicateSecrets]: duplicateSecretsReport,
  [AuditReportType.SecretValidationCompliance]: secretValidationComplianceReport,
  [AuditReportType.UpcomingRotations]: upcomingRotationsReport,
  [AuditReportType.FailedRotations]: failedRotationsReport,
  [AuditReportType.UpcomingReminders]: upcomingRemindersReport,
  [AuditReportType.SecretAccessLog]: secretAccessLogReport
};
