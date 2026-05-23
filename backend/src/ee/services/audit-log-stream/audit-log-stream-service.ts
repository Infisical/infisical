import { ForbiddenError } from "@casl/ability";
import { isAxiosError } from "axios";

import { OrganizationActionScope, OrgMembershipRole, OrgMembershipStatus, TAuditLogs } from "@app/db/schemas";
import {
  decryptLogStream,
  decryptLogStreamCredentials,
  encryptLogStreamCredentials,
  listProviderOptions
} from "@app/ee/services/audit-log-stream/audit-log-stream-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import { LogProvider } from "./audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "./audit-log-stream-factory";
import { TAuditLogStream, TCreateAuditLogStreamDTO, TUpdateAuditLogStreamDTO } from "./audit-log-stream-types";
import { TCustomProviderCredentials } from "./custom/custom-provider-types";

const FAILURE_THRESHOLD = 20; // 20 errors threshold
const FAILURE_WINDOW_MINUTES = 5; // counter expires after this much idle time since the last error
const FAILURE_WINDOW_SECONDS = FAILURE_WINDOW_MINUTES * 60;
const FAILURE_ALERT_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours alert cooldown
const LAST_ERROR_MESSAGE_MAX_LENGTH = 1000;

export type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<
    TKeyStoreFactory,
    "incrementByWithExpiry" | "getItem" | "setItemWithExpiryNX" | "deleteItem" | "deleteItemsByKeyIn"
  >;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
};

export type TAuditLogStreamServiceFactory = ReturnType<typeof auditLogStreamServiceFactory>;

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  permissionService,
  licenseService,
  kmsService,
  keyStore,
  notificationService,
  smtpService,
  orgDAL
}: TAuditLogStreamServiceFactoryDep) => {
  const create = async ({ provider, credentials }: TCreateAuditLogStreamDTO, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.auditLogStreams) {
      throw new BadRequestError({
        message: "Failed to create Audit Log Stream: Plan restriction. Upgrade plan to continue."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const totalStreams = await auditLogStreamDAL.find({ orgId: actor.orgId });
    if (totalStreams.length >= plan.auditLogStreamLimit) {
      throw new BadRequestError({
        message: "Failed to create Audit Log Stream: Plan limit reached. Contact Infisical to increase quota."
      });
    }

    const factory = LOG_STREAM_FACTORY_MAP[provider]();
    const validatedCredentials = await factory.validateCredentials({ credentials });

    const encryptedCredentials = await encryptLogStreamCredentials({
      credentials: validatedCredentials,
      orgId: actor.orgId,
      kmsService
    });

    const logStream = await auditLogStreamDAL.create({
      orgId: actor.orgId,
      provider,
      encryptedCredentials
    });

    return { ...logStream, credentials: validatedCredentials } as TAuditLogStream;
  };

  const resetFailureTracking = async (streamId: string) => {
    await keyStore.deleteItemsByKeyIn([
      KeyStorePrefixes.AuditLogStreamAlertSent(streamId),
      KeyStorePrefixes.AuditLogStreamFailureCount(streamId)
    ]);
  };

  const readLastErrorFromCooldown = async (streamId: string) => {
    const raw = await keyStore.getItem(KeyStorePrefixes.AuditLogStreamAlertSent(streamId));
    if (!raw) return { lastErrorMessage: null, lastErrorTimestamp: null };

    try {
      const parsed = JSON.parse(raw) as { message?: unknown; timestamp?: unknown };
      const message = typeof parsed.message === "string" ? parsed.message : null;
      const timestampStr = typeof parsed.timestamp === "string" ? parsed.timestamp : null;
      const timestamp = timestampStr ? new Date(timestampStr) : null;
      return {
        lastErrorMessage: message,
        lastErrorTimestamp: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
      };
    } catch {
      return { lastErrorMessage: null, lastErrorTimestamp: null };
    }
  };

  const updateById = async (
    { logStreamId, provider, credentials }: TUpdateAuditLogStreamDTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.auditLogStreams) {
      throw new BadRequestError({
        message: "Failed to update Audit Log Stream: Plan restriction. Upgrade plan to continue."
      });
    }

    const logStream = await auditLogStreamDAL.findById(logStreamId);
    if (!logStream) throw new NotFoundError({ message: `Audit Log Stream with ID '${logStreamId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: logStream.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const finalCredentials = { ...credentials };

    // For the "Custom" provider, we must handle masked header values ('******').
    // These are placeholders from the frontend for secrets that haven't been changed.
    // We need to replace them with the original, unmasked values from the database.
    if (
      provider === LogProvider.Custom &&
      "headers" in finalCredentials &&
      Array.isArray(finalCredentials.headers) &&
      finalCredentials.headers.some((header) => header.value === "******")
    ) {
      const decryptedOldCredentials = (await decryptLogStreamCredentials({
        encryptedCredentials: logStream.encryptedCredentials,
        orgId: logStream.orgId,
        kmsService
      })) as TCustomProviderCredentials;

      const oldHeadersMap = decryptedOldCredentials.headers.reduce<Record<string, string>>((acc, header) => {
        acc[header.key] = header.value;
        return acc;
      }, {});

      const finalHeaders: { key: string; value: string }[] = [];
      for (const header of finalCredentials.headers) {
        if (header.value === "******") {
          const oldValue = oldHeadersMap[header.key];
          if (oldValue) {
            finalHeaders.push({ key: header.key, value: oldValue });
          }
        } else {
          finalHeaders.push(header);
        }
      }
      finalCredentials.headers = finalHeaders;
    }

    const factory = LOG_STREAM_FACTORY_MAP[provider]();
    const validatedCredentials = await factory.validateCredentials({ credentials: finalCredentials });

    const encryptedCredentials = await encryptLogStreamCredentials({
      credentials: validatedCredentials,
      orgId: logStream.orgId,
      kmsService
    });

    const updatedLogStream = await auditLogStreamDAL.updateById(logStreamId, {
      encryptedCredentials
    });

    // Reset the cooldown lock AND any live failure buckets so a reconfigured stream starts from a clean state.
    await resetFailureTracking(logStreamId);

    return { ...updatedLogStream, credentials: validatedCredentials } as TAuditLogStream;
  };

  const deleteById = async (logStreamId: string, provider: LogProvider, actor: OrgServiceActor) => {
    const logStream = await auditLogStreamDAL.findById(logStreamId);
    if (!logStream) throw new NotFoundError({ message: `Audit Log Stream with ID '${logStreamId}' not found` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: logStream.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    if (logStream.provider !== provider) {
      throw new BadRequestError({
        message: `Audit Log Stream with ID '${logStreamId}' is not for provider '${provider}'`
      });
    }

    const deletedLogStream = await auditLogStreamDAL.deleteById(logStreamId);

    await resetFailureTracking(logStreamId);

    return decryptLogStream(deletedLogStream, kmsService);
  };

  const getById = async (logStreamId: string, provider: LogProvider, actor: OrgServiceActor) => {
    const logStream = await auditLogStreamDAL.findById(logStreamId);

    if (!logStream) throw new NotFoundError({ message: `Audit log stream with ID '${logStreamId}' not found` });
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: logStream.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    if (logStream.provider !== provider) {
      throw new BadRequestError({
        message: `Audit Log Stream with ID '${logStreamId}' is not for provider '${provider}'`
      });
    }

    const decrypted = await decryptLogStream(logStream, kmsService);
    const lastError = await readLastErrorFromCooldown(logStream.id);
    return { ...decrypted, ...lastError };
  };

  const list = async (actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const logStreams = await auditLogStreamDAL.find({ orgId: actor.orgId });

    return Promise.all(
      logStreams.map(async (stream) => {
        const decrypted = await decryptLogStream(stream, kmsService);
        const lastError = await readLastErrorFromCooldown(stream.id);
        return { ...decrypted, ...lastError };
      })
    );
  };

  const notifyStreamFailure = async (
    orgId: string,
    streamId: string,
    provider: string,
    failureCount: number,
    lastError: { message: string; timestamp: string }
  ) => {
    const appCfg = getConfig();
    const orgAdmins = await orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin);
    const activeAdmins = orgAdmins.filter((admin) => admin.status !== OrgMembershipStatus.Invited);
    if (activeAdmins.length === 0) {
      logger.warn({ orgId }, "Organization has no admins to notify about audit stream failure.");
      return;
    }

    const streamPath = `/organizations/${orgId}/settings?selectedTab=tag-audit-log-streams`;
    const streamUrl = `${appCfg.SITE_URL}${streamPath}`;

    await notificationService.createUserNotifications(
      activeAdmins.map((admin) => ({
        userId: admin.user.id,
        orgId,
        type: NotificationType.AUDIT_LOG_STREAM_FAILED,
        title: "Audit Log Stream Failure",
        body: `Your **${provider}** audit log stream has failed ${failureCount} times in a row, with no more than ${FAILURE_WINDOW_MINUTES} minutes between failures. Audit logs may not be reaching their destination.`,
        link: streamPath
      }))
    );

    const adminEmails = activeAdmins.map((admin) => admin.user.email).filter(Boolean) as string[];
    if (adminEmails.length === 0) {
      return;
    }
    await smtpService
      .sendMail({
        recipients: adminEmails,
        subjectLine: "Audit Log Stream Failure Alert",
        template: SmtpTemplates.AuditLogStreamFailed,
        substitutions: {
          provider,
          windowFailureCount: failureCount,
          windowMinutes: FAILURE_WINDOW_MINUTES,
          streamUrl,
          lastErrorMessage: lastError.message,
          lastErrorTimestamp: lastError.timestamp
        }
      })
      .catch((err) =>
        logger.error(err, `Failed to send audit log stream failure email [streamId=${streamId}] [orgId=${orgId}]`)
      );
  };

  const evaluateErrorSlidingWindow = async (
    orgId: string,
    streamId: string,
    provider: string,
    errorMessage: string
  ) => {
    try {
      const alertKey = KeyStorePrefixes.AuditLogStreamAlertSent(streamId);

      // Skip tracking while the stream is in alert cooldown — counts won't be acted on until cooldown expires.
      const inCooldown = await keyStore.getItem(alertKey);
      if (inCooldown) return;

      // Increment a single counter and roll its TTL forward on every error. The window is anchored on
      // the latest activity — if no new error arrives within FAILURE_WINDOW_SECONDS, the counter expires.
      const counterKey = KeyStorePrefixes.AuditLogStreamFailureCount(streamId);
      const failureCount = await keyStore.incrementByWithExpiry(counterKey, 1, FAILURE_WINDOW_SECONDS);

      if (failureCount < FAILURE_THRESHOLD) return;

      // Capture the last error message and timestamp inside the cooldown payload so list reads and
      // the failure email both surface the most recent root cause to admins.
      const truncatedMessage =
        errorMessage.length > LAST_ERROR_MESSAGE_MAX_LENGTH
          ? `${errorMessage.slice(0, LAST_ERROR_MESSAGE_MAX_LENGTH)}...`
          : errorMessage;
      const lastError = { message: truncatedMessage, timestamp: new Date().toISOString() };

      // NX lock ensures only one worker fires the alert within the cooldown window.
      const acquired = await keyStore.setItemWithExpiryNX(
        alertKey,
        FAILURE_ALERT_COOLDOWN_SECONDS,
        JSON.stringify(lastError)
      );
      if (!acquired) return;

      await notifyStreamFailure(orgId, streamId, provider, failureCount, lastError).catch(async (notifyErr) => {
        logger.error(
          notifyErr,
          `Failed to send audit log stream failure notification [streamId=${streamId}] [orgId=${orgId}]`
        );
        // Release the lock so the next threshold breach can retry delivery.
        await keyStore.deleteItem(alertKey);
      });
    } catch (trackingErr) {
      logger.error(
        trackingErr,
        `Failed to track audit log stream failure count [streamId=${streamId}] [orgId=${orgId}]`
      );
    }
  };

  const streamLog = async (orgId: string, auditLog: TAuditLogs) => {
    const logStreams = await auditLogStreamDAL.find({ orgId });
    await Promise.allSettled(
      logStreams.map(async (logStream) => {
        const { id, provider, encryptedCredentials } = logStream;
        const credentials = await decryptLogStreamCredentials({
          encryptedCredentials,
          orgId,
          kmsService
        });

        const factory = LOG_STREAM_FACTORY_MAP[provider as LogProvider]();

        try {
          await factory.streamLog({ credentials, auditLog });
        } catch (error) {
          let errorMessage: string;
          if (isAxiosError(error)) {
            errorMessage = `${error?.message ?? "Request failed"} — ${JSON.stringify(error?.response?.data) ?? ""}`;
            logger.error(
              `audit-log-queue: Failed to stream audit log due to request error [auditLogId=${auditLog.id}] [event=${auditLog.eventType}] [provider=${provider}] [orgId=${orgId}] [projectId=${auditLog.projectId}] [message=${error?.message}] [response=${JSON.stringify(error?.response?.data)}]`
            );
          } else {
            errorMessage = (error as Error)?.message ?? "Unknown error";
            logger.error(
              error,
              `audit-log-queue: Failed to stream audit log [auditLogId=${auditLog.id}] [event=${auditLog.eventType}] [provider=${provider}] [orgId=${orgId}] [projectId=${auditLog.projectId}]: ${(error as Error)?.message}`
            );
          }

          await evaluateErrorSlidingWindow(orgId, id, provider, errorMessage);
        }
      })
    );
  };

  return {
    create,
    updateById,
    deleteById,
    getById,
    list,
    listProviderOptions,
    streamLog
  };
};
