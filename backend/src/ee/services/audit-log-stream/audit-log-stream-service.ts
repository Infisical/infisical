import { ForbiddenError } from "@casl/ability";

import { SecretKeyEncoding } from "@app/db/schemas";
import { infisicalSymmetricDecrypt, infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { validateLocalIps } from "@app/lib/validator";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TAuditLogStreamServiceFactory = ReturnType<typeof auditLogStreamServiceFactory>;

export const auditLogStreamServiceFactory = ({
  auditLogStreamDAL,
  permissionService,
  projectDAL,
  licenseService
}: TAuditLogStreamServiceFactoryDep) => {
  const create = async ({
    projectSlug,
    url,
    actor,
    token,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateAuditLogStreamDTO) => {
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams)
      throw new BadRequestError({
        message: "Failed to create audit log streams due to plan restriction. Upgrade plan to create group."
      });

    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);

    validateLocalIps(url);

    const totalStreams = await auditLogStreamDAL.find({ projectId });
    if (totalStreams.length >= plan.auditLogStreamLimit) {
      throw new BadRequestError({
        message:
          "Failed to create audit log streams due to plan limit reached. Kindly contact Infisical to add more streams."
      });
    }
    const encryptedToken = token ? infisicalSymmetricEncypt(token) : undefined;
    const logStream = await auditLogStreamDAL.create({
      projectId,
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
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.auditLogStreams)
      throw new BadRequestError({
        message: "Failed to update audit log streams due to plan restriction. Upgrade plan to create group."
      });

    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { projectId } = logStream;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    if (url) validateLocalIps(url);
    const encryptedToken = token ? infisicalSymmetricEncypt(token) : undefined;
    const updatedLogStream = await auditLogStreamDAL.updateById(id, {
      projectId,
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
    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { projectId } = logStream;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);

    const deletedLogStream = await auditLogStreamDAL.deleteById(id);
    return deletedLogStream;
  };

  const getById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TGetDetailsAuditLogStreamDTO) => {
    const logStream = await auditLogStreamDAL.findById(id);
    if (!logStream) throw new BadRequestError({ message: "Audit log stream not found" });

    const { projectId } = logStream;
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
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

  const list = async ({ projectSlug, actor, actorId, actorOrgId, actorAuthMethod }: TListAuditLogStreamDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Settings);

    const logStreams = await auditLogStreamDAL.find({ projectId });
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
