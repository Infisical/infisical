import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";

import { OrganizationActionScope, SubscriptionProductCategory, TAuditLogs } from "@app/db/schemas";
import {
  decryptLogStream,
  decryptLogStreamCredentials,
  encryptLogStreamCredentials,
  listProviderOptions
} from "@app/ee/services/audit-log-stream/audit-log-stream-fns";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import { LogProvider } from "./audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "./audit-log-stream-factory";
import { TAuditLogStream, TCreateAuditLogStreamDTO, TUpdateAuditLogStreamDTO } from "./audit-log-stream-types";
import { TCustomProviderCredentials } from "./custom/custom-provider-types";

export type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAuditLogStreamServiceFactory = ReturnType<typeof auditLogStreamServiceFactory>;

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  permissionService,
  licenseService,
  kmsService
}: TAuditLogStreamServiceFactoryDep) => {
  const create = async ({ provider, credentials }: TCreateAuditLogStreamDTO, actor: OrgServiceActor) => {
    const plan = await licenseService.getPlan(actor.orgId);
    if (!plan.get(SubscriptionProductCategory.Platform, "auditLogStreams")) {
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
    const auditLogStreamLimit = plan.get(SubscriptionProductCategory.Platform, "auditLogStreamLimit");
    if (auditLogStreamLimit && totalStreams.length >= auditLogStreamLimit) {
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
    if (!plan.get(SubscriptionProductCategory.Platform, "auditLogStreams")) {
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
      orgId: actor.orgId,
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
      orgId: actor.orgId,
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
      orgId: actor.orgId,
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
      orgId: actor.orgId,
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

  const streamLog = async (orgId: string, auditLog: TAuditLogs) => {
    const logStreams = await auditLogStreamDAL.find({ orgId });
    await Promise.allSettled(
      logStreams.map(async ({ provider, encryptedCredentials }) => {
        const credentials = await decryptLogStreamCredentials({
          encryptedCredentials,
          orgId,
          kmsService
        });

        const factory = LOG_STREAM_FACTORY_MAP[provider as LogProvider]();

        try {
          await factory.streamLog({
            credentials,
            auditLog
          });
        } catch (error) {
          logger.error(
            error,
            `Failed to stream audit log [auditLogId=${auditLog.id}] [provider=${provider}] [orgId=${orgId}]${error instanceof AxiosError ? `: ${error.message}` : ""}`
          );
          throw error;
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
