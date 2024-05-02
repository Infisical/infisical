import { ForbiddenError } from "@casl/ability";
import { RawAxiosRequestHeaders } from "axios";

import { SecretKeyEncoding } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { validateLocalIps } from "@app/lib/validator";

import { AUDIT_LOG_STREAM_TIMEOUT } from "../audit-log/audit-log-queue";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TAuditLogStreamDALFactory } from "./audit-log-stream-dal";
import {
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
  const create = async ({ url, actor, token, actorId, actorOrgId, actorAuthMethod }: TCreateAuditLogStreamDTO) => {
    if (!actorOrgId) throw new BadRequestError({ message: "Missing org id from token" });

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

    validateLocalIps(url);

    const totalStreams = await auditLogStreamDAL.find({ orgId: actorOrgId });
    if (totalStreams.length >= plan.auditLogStreamLimit) {
      throw new BadRequestError({
        message:
          "Failed to create audit log streams due to plan limit reached. Kindly contact Infisical to add more streams."
      });
    }

    // testing connection first
    const headers: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    await request.post(
      url,
      { ping: "ok" },
      {
        headers,
        // request timeout
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        // connection timeout
        signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
      }
    );
    const encryptedToken = token ? infisicalSymmetricEncypt(token) : undefined;
    const logStream = await auditLogStreamDAL.create({
      orgId: actorOrgId,
      url,
      ...(encryptedToken
        ? {
            encryptedTokenCiphertext: encryptedToken.ciphertext,
            encryptedTokenIV: encryptedToken.iv,
            encryptedTokenTag: encryptedToken.tag,
            encryptedTokenAlgorithm: encryptedToken.algorithm,
            encryptedTokenKeyEncoding: encryptedToken.encoding
          }
        : {})
    });
    return logStream;
  };

  const updateById = async ({
    id,
    url,
    actor,
    token,
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

    if (url) validateLocalIps(url);

    // testing connection first
    const headers: RawAxiosRequestHeaders = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    await request.post(
      url || logStream.url,
      { ping: "ok" },
      {
        headers,
        // request timeout
        timeout: AUDIT_LOG_STREAM_TIMEOUT,
        // connection timeout
        signal: AbortSignal.timeout(AUDIT_LOG_STREAM_TIMEOUT)
      }
    );

    const encryptedToken = token ? infisicalSymmetricEncypt(token) : undefined;
    const updatedLogStream = await auditLogStreamDAL.updateById(id, {
      url,
      ...(encryptedToken
        ? {
            encryptedTokenCiphertext: encryptedToken.ciphertext,
            encryptedTokenIV: encryptedToken.iv,
            encryptedTokenTag: encryptedToken.tag,
            encryptedTokenAlgorithm: encryptedToken.algorithm,
            encryptedTokenKeyEncoding: encryptedToken.encoding
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

    const token =
      logStream?.encryptedTokenCiphertext && logStream?.encryptedTokenIV && logStream?.encryptedTokenTag
        ? infisicalSymmetricDecrypt({
            tag: logStream.encryptedTokenTag,
            iv: logStream.encryptedTokenIV,
            ciphertext: logStream.encryptedTokenCiphertext,
            keyEncoding: logStream.encryptedTokenKeyEncoding as SecretKeyEncoding
          })
        : undefined;

    return { ...logStream, token };
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
