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

const FAILURE_THRESHOLD = 10; // 10 errors threshold
const FAILURE_WINDOW_MINUTES = 5; // sliding window width in 1 minute buckets
const FAILURE_ALERT_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours alert cooldown
const BUCKET_TTL_SECONDS = (FAILURE_WINDOW_MINUTES + 2) * 60; // 7 minutes bucket TTL

export type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "incrementBy" | "setExpiry" | "getItems" | "setItemWithExpiryNX">;
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

    return decryptLogStream(logStream, kmsService);
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

    return Promise.all(logStreams.map((stream) => decryptLogStream(stream, kmsService)));
  };

  const notifyStreamFailure = async (orgId: string, streamId: string, provider: string, failureCount: number) => {
    const appCfg = getConfig();
    const orgAdmins = await orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin);
    const activeAdmins = orgAdmins.filter((admin) => admin.status !== OrgMembershipStatus.Invited);
    if (activeAdmins.length === 0) {
      logger.warn({ orgId }, "Organization has no admins to notify about audit stream failure.");
      return;
    }

    const adminEmails = activeAdmins.map((admin) => admin.user.email).filter(Boolean) as string[];
    const streamPath = `/organizations/${orgId}/settings?selectedTab=tag-audit-log-streams`;
    const streamUrl = `${appCfg.SITE_URL}${streamPath}`;

    await notificationService.createUserNotifications(
      activeAdmins.map((admin) => ({
        userId: admin.user.id,
        orgId,
        type: NotificationType.AUDIT_LOG_STREAM_FAILED,
        title: "Audit Log Stream Failure",
        body: `Your **${provider}** audit log stream has failed ${failureCount} times in the last ${FAILURE_WINDOW_MINUTES} minutes. Audit logs may not be reaching their destination.`,
        link: streamPath
      }))
    );
    await smtpService
      .sendMail({
        recipients: adminEmails,
        subjectLine: "Audit Log Stream Failure Alert",
        template: SmtpTemplates.AuditLogStreamFailed,
        substitutions: {
          provider,
          windowFailureCount: failureCount,
          windowMinutes: FAILURE_WINDOW_MINUTES,
          streamUrl
        }
      })
      .catch((err) =>
        logger.error(err, `Failed to send audit log stream failure email [streamId=${streamId}] [orgId=${orgId}]`)
      );
  };

  const evaluateErrorBucketSlidingWindow = async (orgId: string, streamId: string, provider: string) => {
    try {
      const nowMinuteBucket = Math.floor(Date.now() / 60000);

      // Increment the current minute's bucket, anchoring its TTL on the first write so it
      // self-expires after the window passes without any cleanup needed on the success path.
      const currentBucketKey = KeyStorePrefixes.AuditLogStreamFailureBucket(streamId, nowMinuteBucket);
      const bucketCount = await keyStore.incrementBy(currentBucketKey, 1);
      if (bucketCount === 1) {
        await keyStore.setExpiry(currentBucketKey, BUCKET_TTL_SECONDS);
      }

      // Sum all buckets in the window with a single MGET round-trip.
      const bucketKeys = Array.from({ length: FAILURE_WINDOW_MINUTES }, (_, i) =>
        KeyStorePrefixes.AuditLogStreamFailureBucket(streamId, nowMinuteBucket - i)
      );
      const bucketValues = await keyStore.getItems(bucketKeys);
      const windowFailureCount = bucketValues.reduce((sum, val) => sum + (parseInt(val ?? "0", 10) || 0), 0);

      if (windowFailureCount < FAILURE_THRESHOLD) return;

      // NX lock ensures only one worker fires the alert within the cooldown window.
      const acquired = await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.AuditLogStreamAlertSent(streamId),
        FAILURE_ALERT_COOLDOWN_SECONDS,
        "1"
      );
      if (!acquired) return;

      void notifyStreamFailure(orgId, streamId, provider, windowFailureCount).catch((notifyErr) =>
        logger.error(
          notifyErr,
          `Failed to send audit log stream failure notification [streamId=${streamId}] [orgId=${orgId}]`
        )
      );
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
          if (isAxiosError(error)) {
            logger.error(
              `audit-log-queue: Failed to stream audit log due to request error [auditLogId=${auditLog.id}] [event=${auditLog.eventType}] [provider=${provider}] [orgId=${orgId}] [projectId=${auditLog.projectId}] [message=${error?.message}] [response=${JSON.stringify(error?.response?.data)}]`
            );
          } else {
            logger.error(
              error,
              `audit-log-queue: Failed to stream audit log [auditLogId=${auditLog.id}] [event=${auditLog.eventType}] [provider=${provider}] [orgId=${orgId}] [projectId=${auditLog.projectId}]: ${(error as Error)?.message}`
            );
          }

          await evaluateErrorBucketSlidingWindow(orgId, id, provider);
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
