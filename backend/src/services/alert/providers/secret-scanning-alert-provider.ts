import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  SecretScanningDataSource,
  SecretScanningScanTrigger,
  SecretScanningScanType
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import {
  SECRET_SCANNING_RESOURCE_TYPE,
  SecretScanningAlertEvent,
  SecretScanningScanFailedPayloadSchema,
  SecretScanningSecretsDetectedPayloadSchema
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-events";
import { SECRET_SCANNING_DATA_SOURCE_NAME_MAP } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-maps";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAlertPayload } from "../alert-channel-types";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { TSecretScanningAlertDALFactory, TSecretScanningAlertScan } from "./secret-scanning-alert-dal";

export { SECRET_SCANNING_RESOURCE_TYPE, SecretScanningAlertEvent };

const SecretScanningConditionSchema = z
  .object({
    scanTriggers: z
      .array(z.nativeEnum(SecretScanningScanTrigger))
      .min(1, "scanTriggers must list at least one trigger. To cover them all, leave scanTriggers out.")
      .refine(
        (triggers) => new Set(triggers).size === triggers.length,
        "scanTriggers lists the same trigger more than once"
      )
      .optional()
  })
  .strict()
  .nullish();

const SCAN_TRIGGER_LABELS: Record<SecretScanningScanTrigger, string> = {
  [SecretScanningScanTrigger.Manual]: "Manual scan",
  [SecretScanningScanTrigger.ResourcesAdded]: "New resource",
  [SecretScanningScanTrigger.Push]: "Push",
  [SecretScanningScanTrigger.PullRequest]: "Pull request"
};

const scanLabel = (scan: TSecretScanningAlertScan) => {
  const triggerLabel = SCAN_TRIGGER_LABELS[scan.scanTrigger as SecretScanningScanTrigger];
  if (triggerLabel) return triggerLabel;
  return scan.scanType === SecretScanningScanType.Historical ? "Full scan" : "Push";
};

const dataSourceLabel = (scan: TSecretScanningAlertScan) =>
  `${scan.dataSourceName} (${SECRET_SCANNING_DATA_SOURCE_NAME_MAP[scan.dataSourceType as SecretScanningDataSource] ?? scan.dataSourceType})`;

const pluralizeSecrets = (count: number) => `${count} secret${count === 1 ? "" : "s"}`;

type TSecretScanningAlertTarget = TSecretScanningAlertScan &
  (
    | { event: SecretScanningAlertEvent.SecretsDetected; unresolvedFindings: number }
    | { event: SecretScanningAlertEvent.ScanFailed; errorMessage: string }
  );

const parsePayload = <T extends z.ZodTypeAny>(schema: T, eventType: string, payload: unknown): z.infer<T> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Unreadable '${eventType}' payload: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`
    );
  }
  return parsed.data as z.infer<T>;
};

export type TSecretScanningAlertProviderDep = {
  secretScanningAlertDAL: TSecretScanningAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export const secretScanningAlertProviderFactory = ({
  secretScanningAlertDAL,
  permissionService
}: TSecretScanningAlertProviderDep): IEventAlertProvider<TSecretScanningAlertTarget> => {
  const $projectUrl = (orgId: string, projectId?: string | null) =>
    `${getConfig().SITE_URL}/organizations/${orgId}/projects/secret-scanning/${projectId}`;

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TSecretScanningAlertTarget[]> => {
    if (!input.projectId || !input.resourceId) return [];

    const scans = await secretScanningAlertDAL.findScansByIds({
      projectId: input.projectId,
      dataSourceId: input.resourceId,
      scanIds: input.targetIds,
      scanTriggers: SecretScanningConditionSchema.parse(input.condition)?.scanTriggers
    });

    if (input.eventType === SecretScanningAlertEvent.SecretsDetected) {
      const { unresolvedFindings } = parsePayload(
        SecretScanningSecretsDetectedPayloadSchema,
        input.eventType,
        input.payload
      );
      return scans.map((scan) => ({ ...scan, event: SecretScanningAlertEvent.SecretsDetected, unresolvedFindings }));
    }

    if (input.eventType === SecretScanningAlertEvent.ScanFailed) {
      const { errorMessage } = parsePayload(SecretScanningScanFailedPayloadSchema, input.eventType, input.payload);
      return scans.map((scan) => ({ ...scan, event: SecretScanningAlertEvent.ScanFailed, errorMessage }));
    }

    return [];
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    alert.eventType === SecretScanningAlertEvent.ScanFailed
      ? `${$projectUrl(alert.orgId, alert.projectId)}/data-sources`
      : `${$projectUrl(alert.orgId, alert.projectId)}/findings`;

  const buildPayload = (
    alert: TAlertContext,
    targets: TSecretScanningAlertTarget[],
    viewUrl: string
  ): TAlertPayload => {
    const isScanFailed = alert.eventType === SecretScanningAlertEvent.ScanFailed;
    const [first] = targets;

    const summary = (() => {
      if (isScanFailed) {
        return targets.length === 1 && first
          ? `Secret scanning failed for ${first.resourceName}`
          : `Secret scanning failed for ${targets.length} resources`;
      }
      const total = targets.reduce(
        (sum, target) =>
          sum + (target.event === SecretScanningAlertEvent.SecretsDetected ? target.unresolvedFindings : 0),
        0
      );
      const where = targets.length === 1 && first ? first.resourceName : `${targets.length} resources`;
      return `${pluralizeSecrets(total)} detected in ${where}. Rotate any that are real`;
    })();

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        viewUrl
      },
      eventKey: alert.eventType,
      eventLabel: isScanFailed ? "Scan Failed" : "Secrets Detected",
      webhookType: isScanFailed
        ? "com.infisical.secret-scanning.scan-failed"
        : "com.infisical.secret-scanning.secrets-detected",
      resourceKind: "Secret Scanning",
      resourceOwnerKind: "Secret Scanning",
      severity: isScanFailed ? "error" : "critical",
      summary,
      items: targets.map((target) => ({
        id: target.scanId,
        title: target.resourceName,
        identifier: dataSourceLabel(target),
        url:
          target.event === SecretScanningAlertEvent.ScanFailed
            ? `${$projectUrl(alert.orgId, alert.projectId)}/data-sources/${target.dataSourceType}/${target.dataSourceId}`
            : `${$projectUrl(alert.orgId, alert.projectId)}/findings?scanId=${target.scanId}`,
        fields: [
          { label: "Scan", value: scanLabel(target) },
          target.event === SecretScanningAlertEvent.ScanFailed
            ? { label: "Error", value: target.errorMessage }
            : { label: "Secrets", value: String(target.unresolvedFindings) }
        ]
      }))
    };
  };

  const $requireProject = (projectId?: string | null): string => {
    if (!projectId) {
      throw new BadRequestError({ message: "Secret scanning alerts must be managed within a Secret Scanning project" });
    }
    return projectId;
  };

  // Without a resourceId there is nothing to bind-check: that is a test send, or a list of the project's alerts.
  // Creating an alert without one is refused earlier, since this provider has no project-wide alerts.
  const assertResourceInScope = async (input: { projectId?: string | null; resourceId?: string | null }) => {
    const projectId = $requireProject(input.projectId);
    if (!input.resourceId) return;

    const [dataSource] = await secretScanningAlertDAL.findDataSourcesByIds(projectId, [input.resourceId]);
    if (!dataSource) {
      throw new NotFoundError({ message: `Data source with ID '${input.resourceId}' not found in Secret Scanning` });
    }
  };

  // Alerts are part of a data source's settings, so they take the data source's own permissions.
  const assertPermission = async ({ action, projectId, resourceId, actor }: TAlertPermissionInput): Promise<void> => {
    await assertResourceInScope({ projectId, resourceId });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.actor,
      actorId: actor.actorId,
      projectId: projectId as string,
      actorAuthMethod: actor.actorAuthMethod,
      actorOrgId: actor.actorOrgId,
      actionProjectType: ActionProjectType.SecretScanning
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSub.SecretScanningDataSources
    );

    if (action !== AlertPermissionAction.Read) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretScanningDataSourceActions.Edit,
        ProjectPermissionSub.SecretScanningDataSources
      );
    }
  };

  return {
    resourceType: SECRET_SCANNING_RESOURCE_TYPE,
    events: [
      {
        key: SecretScanningAlertEvent.SecretsDetected,
        triggerType: AlertTriggerType.Event,
        conditionSchema: SecretScanningConditionSchema
      },
      {
        key: SecretScanningAlertEvent.ScanFailed,
        triggerType: AlertTriggerType.Event,
        conditionSchema: SecretScanningConditionSchema
      }
    ],
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.scanId,
    assertPermission,
    assertResourceInScope,
    getResourceNames: ({ orgId, resourceIds }) => secretScanningAlertDAL.findDataSourceNamesByIds(orgId, resourceIds),
    recipientPolicy: { allowProjectAdmins: true }
  };
};
