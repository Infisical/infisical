import { ForbiddenError } from "@casl/ability";
import { RawAxiosRequestHeaders } from "axios";

import { SecretKeyEncoding } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../audit-log/audit-log-queue";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import {
  LogStreamHeaders,
  TCreateAuditLogStreamDTO,
  TDeleteAuditLogStreamDTO,
  TGetDetailsAuditLogStreamDTO,
  TListAuditLogStreamDTO,
  TUpdateAuditLogStreamDTO
} from "./audit-log-stream-types";

type TAuditLogStreamServiceFactoryDep = {
  auditLogStreamDAL: TAuditLogStreamDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TAuditLogStreamServiceFactory = ReturnType<typeof auditLogStreamServiceFactory>;

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  permissionService,
  licenseService
}: TAuditLogStreamServiceFactoryDep) => {
  const create = async ({
    url,
    actor,
    headers = [],
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateAuditLogStreamDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Missing org id from token" });

    const appCfg = getConfig();
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams)
      throw new BadRequestError({
        message: "Failed to create audit log streams due to plan restriction. Upgrade plan to create group."
      });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    if (appCfg.isCloud) {
      blockLocalAndPrivateIpAddresses(url);
    }

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
        { ping: "ok" },
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
    const encryptedHeaders = headers ? infisicalSymmetricEncypt(JSON.stringify(headers)) : undefined;
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

  const updateById = async ({
    id,
    url,
    actor,
    headers = [],
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateAuditLogStreamDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Missing org id from token" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams)
      throw new BadRequestError({
        message: "Failed to update audit log streams due to plan restriction. Upgrade plan to create group."
      });

    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const appCfg = getConfig();
    if (url && appCfg.isCloud) blockLocalAndPrivateIpAddresses(url);

    // testing connection first
    const streamHeaders: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (headers.length)
      headers.forEach(({ key, value }) => {
        streamHeaders[key] = value;
      });

    await request
      .post(
        url || logStream.url,
        { ping: "ok" },
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

    const encryptedHeaders = headers ? infisicalSymmetricEncypt(JSON.stringify(headers)) : undefined;
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

  const deleteById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TDeleteAuditLogStreamDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Missing org id from token" });

    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    const deletedLogStream = await auditLogStreamDAL.deleteById(id);
    return deletedLogStream;
  };

  const getById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TGetDetailsAuditLogStreamDTO) => {
    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { orgId } = logStream;
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const headers =
      logStream?.encryptedHeadersCiphertext && logStream?.encryptedHeadersIV && logStream?.encryptedHeadersTag
        ? (JSON.parse(
            infisicalSymmetricDecrypt({
              tag: logStream.encryptedHeadersTag,
              iv: logStream.encryptedHeadersIV,
              ciphertext: logStream.encryptedHeadersCiphertext,
              keyEncoding: logStream.encryptedHeadersKeyEncoding as SecretKeyEncoding
            })
          ) as LogStreamHeaders[])
        : undefined;

    return { ...logStream, headers };
  };

  const list = async ({ actor, actorId, actorOrgId, actorAuthMethod }: TListAuditLogStreamDTO) => {
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
