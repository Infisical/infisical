import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { PamProductRole } from "../pam/pam-enums";
import { TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { TPamAccountTemplateDALFactory } from "./pam-account-template-dal";
import {
  TCreatePamAccountTemplateDTO,
  TDeletePamAccountTemplateDTO,
  TGetPamAccountTemplateDTO,
  TListPamAccountTemplatesDTO,
  TUpdatePamAccountTemplateDTO
} from "./pam-account-template-types";

type TPamAccountTemplateServiceFactoryDep = {
  pamAccountTemplateDAL: TPamAccountTemplateDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPamAccountTemplateServiceFactory = ReturnType<typeof pamAccountTemplateServiceFactory>;

export const pamAccountTemplateServiceFactory = ({
  pamAccountTemplateDAL,
  permissionService
}: TPamAccountTemplateServiceFactoryDep) => {
  const verifyMembership = (projectId: string, ctx: TActorContext) =>
    verifyProductMembership(permissionService, projectId, ctx);

  const verifyProductAdmin = async (projectId: string, ctx: TActorContext) => {
    const { hasRole } = await verifyMembership(projectId, ctx);
    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "Only PAM product admins can perform this action" });
    }
  };

  const list = async ({ projectId, search, type, ...ctx }: TListPamAccountTemplatesDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);
    return pamAccountTemplateDAL.findByProjectId(projectId, { search, type });
  };

  const getById = async ({ templateId, projectId, ...ctx }: TGetPamAccountTemplateDTO & TActorContext) => {
    await verifyMembership(projectId, ctx);

    const template = await pamAccountTemplateDAL.findById(templateId);
    if (!template || template.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const accountCount = await pamAccountTemplateDAL.countAccountsByTemplateId(templateId);
    return { ...template, accountCount };
  };

  const create = async ({
    projectId,
    name,
    description,
    type,
    accessPolicy,
    settings,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TCreatePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    try {
      return await pamAccountTemplateDAL.create({
        projectId,
        name,
        description,
        type,
        accessPolicy: accessPolicy ? JSON.stringify(accessPolicy) : undefined,
        settings: settings ? JSON.stringify(settings) : undefined,
        gatewayId,
        gatewayPoolId,
        recordingConnectionId
      });
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A template named "${name}" already exists` });
      }
      throw err;
    }
  };

  const update = async ({
    templateId,
    projectId,
    name,
    description,
    accessPolicy,
    settings,
    gatewayId,
    gatewayPoolId,
    recordingConnectionId,
    ...ctx
  }: TUpdatePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    const existing = await pamAccountTemplateDAL.findById(templateId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (accessPolicy !== undefined) updateData.accessPolicy = JSON.stringify(accessPolicy);
    if (settings !== undefined) updateData.settings = JSON.stringify(settings);
    if (gatewayId !== undefined) updateData.gatewayId = gatewayId;
    if (gatewayPoolId !== undefined) updateData.gatewayPoolId = gatewayPoolId;
    if (recordingConnectionId !== undefined) updateData.recordingConnectionId = recordingConnectionId;

    try {
      return await pamAccountTemplateDAL.updateById(templateId, updateData);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err as DatabaseError & { code?: string }).code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: `A template named "${name}" already exists` });
      }
      throw err;
    }
  };

  const deleteTemplate = async ({ templateId, projectId, ...ctx }: TDeletePamAccountTemplateDTO & TActorContext) => {
    await verifyProductAdmin(projectId, ctx);

    const existing = await pamAccountTemplateDAL.findById(templateId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: `Account template with ID '${templateId}' not found` });
    }

    const accountCount = await pamAccountTemplateDAL.countAccountsByTemplateId(templateId);
    if (accountCount > 0) {
      throw new BadRequestError({
        message: `Cannot delete template "${existing.name}" because ${accountCount} account(s) still reference it`
      });
    }

    return pamAccountTemplateDAL.deleteById(templateId);
  };

  return { list, getById, create, update, deleteTemplate };
};
