import { ForbiddenError } from "@casl/ability";
import { RawAxiosRequestHeaders } from "axios";

import { SecretKeyEncoding } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../audit-log/audit-log-queue";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import { providerSpecificPayload } from "./audit-log-stream-fns";
import { LogStreamHeaders, TAuditLogStreamServiceFactory } from "./audit-log-stream-types";

type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  permissionService,
  licenseService
}: TAuditLogStreamServiceFactoryDep): TAuditLogStreamServiceFactory => {
  const create: TAuditLogStreamServiceFactory["create"] = async ({
    url,
    actor,
    headers = [],
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID attached to authentication token" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams) {
      throw new BadRequestError({
        message: "Failed to create audit log streams due to plan restriction. Upgrade plan to create group."
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const appCfg = getConfig();
    if (appCfg.isCloud) await blockLocalAndPrivateIpAddresses(url);

    const totalStreams = await auditLogStreamDAL.find({ orgId: actorOrgId });
    if (totalStreams.length >= plan.auditLogStreamLimit) {
      throw new BadRequestError({
        message:
          "Failed to create audit log streams due to plan limit reached. Kindly contact Infisical to add more streams."
      });
    }

    // testing connection first
    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (headers.length)
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });

    await request
      .post(
        url,
        { ...providerSpecificPayload(url), ping: "ok" },
        {
          headers: streamHeaders,
          // request timeout
          timeout: AUDIT_LOG_STREAM_TIMEOUT,
          // connection timeout
          signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
        }
      )
      .catch((err) => {
        throw new BadRequestError({ message: `Failed to connect with upstream source: ${(err as Error)?.message}` });
      });

    const encryptedHeaders = headers
      ? crypto.encryption().symmetric().encryptWithRootEncryptionKey(JSON.stringify(headers))
      : undefined;
    const logStream = await auditLogStreamDAL.create({
      orgId: actorOrgId,
      url,
      ...(encryptedHeaders
        ? {
            encryptedHeadersCiphertext: encryptedHeaders.ciphertext,
            encryptedHeadersIV: encryptedHeaders.iv,
            encryptedHeadersTag: encryptedHeaders.tag,
            encryptedHeadersAlgorithm: encryptedHeaders.algorithm,
            encryptedHeadersKeyEncoding: encryptedHeaders.encoding
          }
        : {})
    });
    return logStream;
  };

  const updateById: TAuditLogStreamServiceFactory["updateById"] = async ({
    id,
    url,
    actor,
    headers = [],
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID attached to authentication token" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams)
      throw new BadRequestError({
        message: "Failed to update audit log streams due to plan restriction. Upgrade plan to create group."
      });

    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new NotFoundError({ message: `Audit log stream with ID '${id}' not found` });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
    const appCfg = getConfig();
    if (url && appCfg.isCloud) await blockLocalAndPrivateIpAddresses(url);

    // testing connection first
    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (headers.length)
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });

    await request
      .post(
        url || logStream.url,
        { ...providerSpecificPayload(url || logStream.url), ping: "ok" },
        {
          headers: streamHeaders,
          // request timeout
          timeout: AUDIT_LOG_STREAM_TIMEOUT,
          // connection timeout
          signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
        }
      )
      .catch((err) => {
        throw new Error(`Failed to connect with the source ${(err as Error)?.message}`);
      });

    const encryptedHeaders = headers
      ? crypto.encryption().symmetric().encryptWithRootEncryptionKey(JSON.stringify(headers))
      : undefined;
    const updatedLogStream = await auditLogStreamDAL.updateById(id, {
      url,
      ...(encryptedHeaders
        ? {
            encryptedHeadersCiphertext: encryptedHeaders.ciphertext,
            encryptedHeadersIV: encryptedHeaders.iv,
            encryptedHeadersTag: encryptedHeaders.tag,
            encryptedHeadersAlgorithm: encryptedHeaders.algorithm,
            encryptedHeadersKeyEncoding: encryptedHeaders.encoding
          }
        : {})
    });
    return updatedLogStream;
  };

  const deleteById: TAuditLogStreamServiceFactory["deleteById"] = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID attached to authentication token" });

    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new NotFoundError({ message: `Audit log stream with ID '${id}' not found` });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    const deletedLogStream = await auditLogStreamDAL.deleteById(id);
    return deletedLogStream;
  };

  const getById: TAuditLogStreamServiceFactory["getById"] = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new NotFoundError({ message: `Audit log stream with ID '${id}' not found` });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const headers =
      logStream?.encryptedHeadersCiphertext && logStream?.encryptedHeadersIV && logStream?.encryptedHeadersTag
        ? (JSON.parse(
            crypto
              .encryption()
              .symmetric()
              .decryptWithRootEncryptionKey({
                tag: logStream.encryptedHeadersTag,
                iv: logStream.encryptedHeadersIV,
                ciphertext: logStream.encryptedHeadersCiphertext,
                keyEncoding: logStream.encryptedHeadersKeyEncoding as SecretKeyEncoding
              })
          ) as LogStreamHeaders[])
        : undefined;

    return { ...logStream, headers };
  };

  const list: TAuditLogStreamServiceFactory["list"] = async ({ actor, actorId, actorOrgId, actorAuthMethod }) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const logStreams = await auditLogStreamDAL.find({ orgId: actorOrgId });
    return logStreams;
  };

  return {
    create,
    updateById,
    deleteById,
    getById,
    list
  };
};
