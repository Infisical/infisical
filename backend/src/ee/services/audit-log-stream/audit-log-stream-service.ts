import { TActorContext } from "@app/domains/lib/actor-context";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, PlanLimit, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import {
  decryptLogStream,
  decryptLogStreamCredentials,
  encryptLogStreamCredentials,
  listProviderOptions
} from "@app/ee/services/audit-log-stream/audit-log-stream-fns";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import { LogProvider, REDACTED_CREDENTIAL_VALUE, StreamMode } from "./audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "./audit-log-stream-factory";
import { TAuditLogStream, TCreateAuditLogStreamDTO, TUpdateAuditLogStreamDTO } from "./audit-log-stream-types";
import { TCustomProviderCredentials } from "./custom/custom-provider-types";
import { TSplunkProviderCredentials } from "./splunk/splunk-provider-types";
import { TSumoLogicProviderCredentials } from "./sumo-logic/sumo-logic-provider-types";

export type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  orgPermissionService: TOrgPermissionService;
  licenseService: TLicenseService;
  kmsDataKeyService: TKmsDataKeyService;
};

export type TAuditLogStreamServiceFactory = ReturnType<typeof auditLogStreamServiceFactory>;

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  orgPermissionService,
  licenseService,
  kmsDataKeyService
}: TAuditLogStreamServiceFactoryDep) => {
  const create = async ({ provider, credentials, filters }: TCreateAuditLogStreamDTO, actor: TActorContext) => {
    const plan = await licenseService.getPlan(actor.org.id);
    if (!plan.has(PlanFeature.AuditLogStreams)) {
      throw new BadRequestError({
        message: "Failed to create Audit Log Stream: Plan restriction. Upgrade plan to continue."
      });
    }

    const permission = await orgPermissionService.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionAuditLogsActions.Edit, subject: OrgPermissionSubjects.AuditLogStreams });

    const totalStreams = await auditLogStreamDAL.find({ orgId: actor.org.id });
    if (plan.exceeds(PlanLimit.AuditLogStreams, totalStreams.length)) {
      throw new BadRequestError({
        message: "Failed to create Audit Log Stream: Plan limit reached. Contact Infisical to increase quota."
      });
    }

    const factory = LOG_STREAM_FACTORY_MAP[provider]();
    const validatedCredentials = await factory.validateCredentials({ credentials });

    const encryptedCredentials = await encryptLogStreamCredentials({
      credentials: validatedCredentials,
      orgId: actor.org.id,
      kmsDataKeyService
    });

    const logStream = await auditLogStreamDAL.create({
      orgId: actor.org.id,
      provider,
      encryptedCredentials,
      // All new streams use batch delivery. "single" is reachable only by existing
      // custom/cribl streams that were migrated, and only as a one-way upgrade away from it.
      streamMode: StreamMode.Batch,
      // null when unset -> stream all products.
      filters: filters ?? null
    });

    return { ...logStream, credentials: validatedCredentials } as TAuditLogStream;
  };

  const updateById = async (
    { logStreamId, provider, credentials, streamMode, filters }: TUpdateAuditLogStreamDTO,
    actor: TActorContext
  ) => {
    const plan = await licenseService.getPlan(actor.org.id);
    if (!plan.has(PlanFeature.AuditLogStreams)) {
      throw new BadRequestError({
        message: "Failed to update Audit Log Stream: Plan restriction. Upgrade plan to continue."
      });
    }

    const logStream = await auditLogStreamDAL.findById(logStreamId);
    if (!logStream) throw new NotFoundError({ message: `Audit Log Stream with ID '${logStreamId}' not found` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: logStream.orgId });

    permission.assert({ action: OrgPermissionAuditLogsActions.Edit, subject: OrgPermissionSubjects.AuditLogStreams });

    if (logStream.provider !== provider) {
      throw new BadRequestError({
        message: `Audit Log Stream with ID '${logStreamId}' is not for provider '${provider}'`
      });
    }

    // Stream mode can only be upgraded from "single" to "batch" — never the reverse.
    // This covers every case: new/vendor streams are already "batch", so any attempt to
    // set "single" on them is a forbidden downgrade.
    if (streamMode === StreamMode.Single && logStream.streamMode === StreamMode.Batch) {
      throw new BadRequestError({
        message: "Audit Log Stream cannot be switched from batch delivery back to single delivery"
      });
    }

    const finalCredentials = { ...credentials };

    // For the "Custom" provider, we must handle masked header values ('******').
    // These are placeholders from the frontend for secrets that haven't been changed.
    // We need to replace them with the original, unmasked values from the database.
    if (
      provider === LogProvider.Custom &&
      "headers" in finalCredentials &&
      Array.isArray(finalCredentials.headers) &&
      finalCredentials.headers.some((header) => header.value === REDACTED_CREDENTIAL_VALUE)
    ) {
      const decryptedOldCredentials = (await decryptLogStreamCredentials({
        encryptedCredentials: logStream.encryptedCredentials,
        orgId: logStream.orgId,
        kmsDataKeyService
      })) as TCustomProviderCredentials;

      const oldHeadersMap = decryptedOldCredentials.headers.reduce<Record<string, string>>((acc, header) => {
        acc[header.key] = header.value;
        return acc;
      }, {});

      const finalHeaders: { key: string; value: string }[] = [];
      for (const header of finalCredentials.headers) {
        if (header.value === REDACTED_CREDENTIAL_VALUE) {
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

    if (
      provider === LogProvider.SumoLogic &&
      "token" in finalCredentials &&
      finalCredentials.token === REDACTED_CREDENTIAL_VALUE
    ) {
      const decryptedOldCredentials = (await decryptLogStreamCredentials({
        encryptedCredentials: logStream.encryptedCredentials,
        orgId: logStream.orgId,
        kmsDataKeyService
      })) as TSumoLogicProviderCredentials;

      (finalCredentials as TSumoLogicProviderCredentials).token = decryptedOldCredentials.token;
    }

    // Splunk's port is optional, so an update that leaves it out has to keep the port the stream was
    // configured with rather than silently falling back to the default HEC port.
    if (provider === LogProvider.Splunk && (finalCredentials as TSplunkProviderCredentials).port === undefined) {
      const decryptedOldCredentials = (await decryptLogStreamCredentials({
        encryptedCredentials: logStream.encryptedCredentials,
        orgId: logStream.orgId,
        kmsDataKeyService
      })) as TSplunkProviderCredentials;

      (finalCredentials as TSplunkProviderCredentials).port = decryptedOldCredentials.port;
    }

    const factory = LOG_STREAM_FACTORY_MAP[provider]();
    const validatedCredentials = await factory.validateCredentials({ credentials: finalCredentials });

    const encryptedCredentials = await encryptLogStreamCredentials({
      credentials: validatedCredentials,
      orgId: logStream.orgId,
      kmsDataKeyService
    });

    const updatedLogStream = await auditLogStreamDAL.updateById(logStreamId, {
      encryptedCredentials,
      // The credentials just passed validateCredentials, so start health tracking over. A stream that
      // is still broken then alerts again instead of staying silent behind its old failingSince.
      failingSince: null,
      lastDeliveryError: null,
      // Only persist a mode change when provided (the validated single -> batch upgrade).
      ...(streamMode ? { streamMode } : {}),
      // `undefined` leaves the existing filter untouched; `null`/empty clears it (stream all).
      ...(filters !== undefined ? { filters } : {})
    });

    return { ...updatedLogStream, credentials: validatedCredentials } as TAuditLogStream;
  };

  const deleteById = async (logStreamId: string, provider: LogProvider, actor: TActorContext) => {
    const logStream = await auditLogStreamDAL.findById(logStreamId);
    if (!logStream) throw new NotFoundError({ message: `Audit Log Stream with ID '${logStreamId}' not found` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: logStream.orgId });

    permission.assert({ action: OrgPermissionAuditLogsActions.Edit, subject: OrgPermissionSubjects.AuditLogStreams });

    if (logStream.provider !== provider) {
      throw new BadRequestError({
        message: `Audit Log Stream with ID '${logStreamId}' is not for provider '${provider}'`
      });
    }

    const deletedLogStream = await auditLogStreamDAL.deleteById(logStreamId);

    return decryptLogStream(deletedLogStream, kmsDataKeyService);
  };

  const getById = async (logStreamId: string, provider: LogProvider, actor: TActorContext) => {
    const logStream = await auditLogStreamDAL.findById(logStreamId);

    if (!logStream) throw new NotFoundError({ message: `Audit log stream with ID '${logStreamId}' not found` });
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: logStream.orgId });

    permission.assert({ action: OrgPermissionAuditLogsActions.Read, subject: OrgPermissionSubjects.AuditLogStreams });

    if (logStream.provider !== provider) {
      throw new BadRequestError({
        message: `Audit Log Stream with ID '${logStreamId}' is not for provider '${provider}'`
      });
    }

    return decryptLogStream(logStream, kmsDataKeyService);
  };

  const list = async (actor: TActorContext) => {
    const permission = await orgPermissionService.getOrgPermission({ actor });

    permission.assert({ action: OrgPermissionAuditLogsActions.Read, subject: OrgPermissionSubjects.AuditLogStreams });

    const logStreams = await auditLogStreamDAL.find({ orgId: actor.org.id });

    return Promise.all(logStreams.map((stream) => decryptLogStream(stream, kmsDataKeyService)));
  };

  return {
    create,
    updateById,
    deleteById,
    getById,
    list,
    listProviderOptions
  };
};
