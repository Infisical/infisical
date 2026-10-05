import { z } from "zod";

import { Event as TAuditEvent, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { ProjectPermissionActions } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertManagerProjectResolverFactory } from "@app/services/cert-manager-instance/cert-manager-project-resolver";
import { PkiAlertScope, PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { AlertChannelType } from "../alert-channel-types";
import { durationToDays } from "../alert-format-fns";
import {
  AlertAuditAction,
  AlertPermissionAction,
  AlertTelemetryAction,
  TAlertAuditInput,
  TAlertTelemetryEvent
} from "../alert-types";

const MIN_ALERT_BEFORE_DAYS = 1;
const MAX_ALERT_BEFORE_DAYS = 365;

const isValidAlertBefore = (alertBefore: string): boolean => {
  const days = durationToDays(alertBefore);
  return days >= MIN_ALERT_BEFORE_DAYS && days <= MAX_ALERT_BEFORE_DAYS;
};

export const ExpiryFieldsSchema = z.object({
  alertBefore: z
    .string()
    .refine(
      isValidAlertBefore,
      `Must be a number of days, weeks, months or years adding up to ${MIN_ALERT_BEFORE_DAYS} to ${MAX_ALERT_BEFORE_DAYS} days, e.g. '30d' or '2w'`
    ),
  dailyReminder: z.boolean().optional()
});

const DAILY_SCAN_DEDUP_MARGIN_HOURS = 4;

const dayMultipleDedupWindowHours = (days: number): number => days * 24 - DAILY_SCAN_DEDUP_MARGIN_HOURS;

export const expirationDedupWindowHours = (days: number, dailyReminder?: boolean): number => {
  if (dailyReminder || days <= 7) return dayMultipleDedupWindowHours(1);
  if (days <= 30) return dayMultipleDedupWindowHours(2);
  if (days <= 90) return dayMultipleDedupWindowHours(7);
  return dayMultipleDedupWindowHours(30);
};

export const CERT_MANAGER_ALERT_PERMISSION_ACTIONS: Record<AlertPermissionAction, ProjectPermissionActions> = {
  [AlertPermissionAction.Read]: ProjectPermissionActions.Read,
  [AlertPermissionAction.Create]: ProjectPermissionActions.Create,
  [AlertPermissionAction.Edit]: ProjectPermissionActions.Edit,
  [AlertPermissionAction.Delete]: ProjectPermissionActions.Delete
};

export const splitAltNames = (altNames: string | null): string[] =>
  (altNames ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

export const certificateDisplayName = (certificate: {
  commonName: string;
  altNames: string | null;
  serialNumber: string;
}): string => certificate.commonName || splitAltNames(certificate.altNames)[0] || certificate.serialNumber;

export const assertCertManagerAlertChannelTypesAllowed = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  { orgId, channelTypes }: { orgId: string; channelTypes: string[] }
) => {
  const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
  if (!gatedType) return;

  const plan = await licenseService.getPlan(orgId);
  if (!plan.pkiEnterpriseAlerting) {
    throw new BadRequestError({
      message: `Failed to save a ${gatedType} channel due to plan restriction. Upgrade plan to alert on channels other than email, or disable or remove the ${gatedType} channel.`
    });
  }
};

export const resolveCertManagerProjectId = async (
  certManagerProjectResolver: Pick<TCertManagerProjectResolverFactory, "getActiveProjectId">,
  orgId: string
) => {
  const projectId = await certManagerProjectResolver.getActiveProjectId(orgId);
  if (!projectId) {
    throw new NotFoundError({ message: "Certificate Manager isn't set up for this organization" });
  }
  return projectId;
};

type TAlertFilterNames = { id: string; name: string | null }[];

export const buildCertificateManagerAlertAuditEvent = (
  input: TAlertAuditInput,
  { applications, profiles }: { applications: TAlertFilterNames; profiles: TAlertFilterNames }
): TAuditEvent => {
  if (input.action === AlertAuditAction.TestChannel) {
    const { test } = input;
    return {
      type: EventType.TEST_CERTIFICATE_MANAGER_ALERT_CHANNEL,
      metadata: {
        alertId: test.alertId,
        alertName: test.alertName ?? null,
        channelId: test.channelId,
        channelName: test.channelName ?? null,
        channelType: test.channelType,
        success: test.success,
        deliveredTo: test.deliveredTo,
        error: test.error
      }
    };
  }

  const { alert } = input;
  const metadata = { alertId: alert.id, name: alert.name, eventType: alert.eventType, applications, profiles };
  if (input.action === AlertAuditAction.Create) return { type: EventType.CREATE_CERTIFICATE_MANAGER_ALERT, metadata };
  if (input.action === AlertAuditAction.Update) return { type: EventType.UPDATE_CERTIFICATE_MANAGER_ALERT, metadata };
  return { type: EventType.DELETE_CERTIFICATE_MANAGER_ALERT, metadata };
};

export const buildPkiAlertTelemetryEvent = (
  action: AlertTelemetryAction,
  properties: { orgId: string; projectId: string; applicationId?: string; alertScope: PkiAlertScope },
  alertType: string
): TAlertTelemetryEvent => {
  switch (action) {
    case AlertTelemetryAction.Create:
      return { event: PostHogEventTypes.PkiAlertCreated, properties: { ...properties, alertType } };
    case AlertTelemetryAction.Update:
      return { event: PostHogEventTypes.PkiAlertUpdated, properties };
    default:
      return { event: PostHogEventTypes.PkiAlertDeleted, properties };
  }
};
