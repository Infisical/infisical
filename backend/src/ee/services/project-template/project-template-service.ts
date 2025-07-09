import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { TProjectTemplates } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectTemplateDefaultEnvironments } from "@app/ee/services/project-template/project-template-constants";
import { getDefaultProjectTemplate } from "@app/ee/services/project-template/project-template-fns";
import {
  TProjectTemplateEnvironment,
  TProjectTemplateRole,
  TProjectTemplateServiceFactory,
  TUnpackedPermission
} from "@app/ee/services/project-template/project-template-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { TProjectTemplateDALFactory } from "./project-template-dal";

type TProjectTemplatesServiceFactoryDep = {
  licenseService: TLicenseServiceFactory;
  permissionService: TPermissionServiceFactory;
  projectTemplateDAL: TProjectTemplateDALFactory;
};

const $unpackProjectTemplate = ({ roles, environments, ...rest }: TProjectTemplates) => ({
  ...rest,
  environments: environments as TProjectTemplateEnvironment[],
  roles: [
    ...getPredefinedRoles({ projectId: "project-template" }).map(({ name, slug, permissions }) => ({
      name,
      slug,
      permissions: permissions as TUnpackedPermission[]
    })),
    ...(roles as TProjectTemplateRole[]).map((role) => ({
      ...role,
      permissions: unpackPermissions(role.permissions)
    }))
  ]
});

export const projectTemplateServiceFactory = ({
  licenseService,
  permissionService,
  projectTemplateDAL
}: TProjectTemplatesServiceFactoryDep): TProjectTemplateServiceFactory => {
  const listProjectTemplatesByOrg: TProjectTemplateServiceFactory["listProjectTemplatesByOrg"] = async (actor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to access project templates due to plan restriction. Upgrade plan to access project templates."
      });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    const projectTemplates = await projectTemplateDAL.find({
      orgId: actor.orgId
    });

    return [
      getDefaultProjectTemplate(actor.orgId),
      ...projectTemplates.map((template) => $unpackProjectTemplate(template))
    ];
  };

  const findProjectTemplateByName: TProjectTemplateServiceFactory["findProjectTemplateByName"] = async (
    name,
    actor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to access project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findOne({ name, orgId: actor.orgId });

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with Name "${name}"` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      projectTemplate.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    return {
      ...$unpackProjectTemplate(projectTemplate),
      packedRoles: projectTemplate.roles as TProjectTemplateRole[] // preserve packed for when applying template
    };
  };

  const findProjectTemplateById: TProjectTemplateServiceFactory["findProjectTemplateById"] = async (id, actor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to access project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findById(id);

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with ID ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      projectTemplate.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    return {
      ...$unpackProjectTemplate(projectTemplate),
      packedRoles: projectTemplate.roles as TProjectTemplateRole[] // preserve packed for when applying template
    };
  };

  const createProjectTemplate: TProjectTemplateServiceFactory["createProjectTemplate"] = async (
    { roles, environments, ...params },
    actor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to create project template due to plan restriction. Upgrade plan to access project templates."
      });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.ProjectTemplates);

    if (environments && plan.environmentLimit !== null && environments.length > plan.environmentLimit) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        message: `Failed to create project template due to environment count exceeding your current limit of ${plan.environmentLimit}. Contact Infisical to increase limit.`
      });
    }

    const isConflictingName = Boolean(
      await projectTemplateDAL.findOne({
        name: params.name,
        orgId: actor.orgId
      })
    );

    if (isConflictingName)
      throw new BadRequestError({
        message: `A project template with the name "${params.name}" already exists.`
      });

    const projectTemplate = await projectTemplateDAL.create({
      ...params,
      roles: JSON.stringify(roles.map((role) => ({ ...role, permissions: packRules(role.permissions) }))),
      environments: environments ? JSON.stringify(environments ?? ProjectTemplateDefaultEnvironments) : null,
      orgId: actor.orgId
    });

    return $unpackProjectTemplate(projectTemplate);
  };

  const updateProjectTemplateById: TProjectTemplateServiceFactory["updateProjectTemplateById"] = async (
    id,
    { roles, environments, ...params },
    actor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to update project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findById(id);

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with ID ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      projectTemplate.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates);

    if (environments && plan.environmentLimit !== null && environments.length > plan.environmentLimit) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        message: `Failed to update project template due to environment count exceeding your current limit of ${plan.environmentLimit}. Contact Infisical to increase limit.`
      });
    }

    if (params.name && projectTemplate.name !== params.name) {
      const isConflictingName = Boolean(
        await projectTemplateDAL.findOne({
          name: params.name,
          orgId: projectTemplate.orgId
        })
      );

      if (isConflictingName)
        throw new BadRequestError({
          message: `A project template with the name "${params.name}" already exists.`
        });
    }

    const updatedProjectTemplate = await projectTemplateDAL.updateById(id, {
      ...params,
      roles: roles
        ? JSON.stringify(roles.map((role) => ({ ...role, permissions: packRules(role.permissions) })))
        : undefined,
      environments: environments ? JSON.stringify(environments) : undefined
    });

    return $unpackProjectTemplate(updatedProjectTemplate);
  };

  const deleteProjectTemplateById: TProjectTemplateServiceFactory["deleteProjectTemplateById"] = async (id, actor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to delete project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findById(id);

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with ID ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      projectTemplate.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.ProjectTemplates);

    const deletedProjectTemplate = await projectTemplateDAL.deleteById(id);

    return $unpackProjectTemplate(deletedProjectTemplate);
  };

  return {
    listProjectTemplatesByOrg,
    createProjectTemplate,
    updateProjectTemplateById,
    deleteProjectTemplateById,
    findProjectTemplateById,
    findProjectTemplateByName
  };
};
