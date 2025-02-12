import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { TProjectTemplates } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getDefaultProjectTemplate } from "@app/ee/services/project-template/project-template-fns";
import {
  TCreateProjectTemplateDTO,
  TProjectTemplateEnvironment,
  TProjectTemplateRole,
  TUnpackedPermission,
  TUpdateProjectTemplateDTO
} from "@app/ee/services/project-template/project-template-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { TProjectTemplateDALFactory } from "./project-template-dal";

type TProjectTemplatesServiceFactoryDep = {
  licenseService: TLicenseServiceFactory;
  permissionService: TPermissionServiceFactory;
  projectTemplateDAL: TProjectTemplateDALFactory;
};

export type TProjectTemplateServiceFactory = ReturnType<typeof projectTemplateServiceFactory>;

const $unpackProjectTemplate = ({ roles, environments, ...rest }: TProjectTemplates) => ({
  ...rest,
  environments: environments as TProjectTemplateEnvironment[],
  roles: [
    ...getPredefinedRoles("project-template").map(({ name, slug, permissions }) => ({
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
}: TProjectTemplatesServiceFactoryDep) => {
  const listProjectTemplatesByOrg = async (actor: OrgServiceActor) => {
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

  const findProjectTemplateByName = async (name: string, actor: OrgServiceActor) => {
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

  const findProjectTemplateById = async (id: string, actor: OrgServiceActor) => {
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

  const createProjectTemplate = async (
    { roles, environments, ...params }: TCreateProjectTemplateDTO,
    actor: OrgServiceActor
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
      environments: JSON.stringify(environments),
      orgId: actor.orgId
    });

    return $unpackProjectTemplate(projectTemplate);
  };

  const updateProjectTemplateById = async (
    id: string,
    { roles, environments, ...params }: TUpdateProjectTemplateDTO,
    actor: OrgServiceActor
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

  const deleteProjectTemplateById = async (id: string, actor: OrgServiceActor) => {
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
