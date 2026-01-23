import { ForbiddenError } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { OrganizationActionScope, ProjectMembershipRole, ProjectType, TProjectTemplates } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectTemplateDefaultEnvironments } from "@app/ee/services/project-template/project-template-constants";
import { getDefaultProjectTemplate } from "@app/ee/services/project-template/project-template-fns";
import {
  TProjectTemplateEnvironment,
  TProjectTemplateGroup,
  TProjectTemplateOrgManagedIdentity,
  TProjectTemplateProjectManagedIdentity,
  TProjectTemplateRole,
  TProjectTemplateServiceFactory,
  TProjectTemplateUser,
  TUnpackedPermission
} from "@app/ee/services/project-template/project-template-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { getPredefinedRoles } from "@app/services/project-role/project-role-fns";

import { TGroupDALFactory } from "../group/group-dal";
import { TProjectTemplateDALFactory } from "./project-template-dal";
import { TProjectTemplateGroupMembershipDALFactory } from "./project-template-group-membership-dal";
import { TProjectTemplateIdentityMembershipDALFactory } from "./project-template-identity-membership-dal";
import { TProjectTemplateUserMembershipDALFactory } from "./project-template-user-membership-dal";

type TProjectTemplatesServiceFactoryDep = {
  licenseService: TLicenseServiceFactory;
  permissionService: TPermissionServiceFactory;
  projectTemplateDAL: TProjectTemplateDALFactory;
  projectTemplateUserMembershipDAL: TProjectTemplateUserMembershipDALFactory;
  projectTemplateGroupMembershipDAL: TProjectTemplateGroupMembershipDALFactory;
  projectTemplateIdentityMembershipDAL: TProjectTemplateIdentityMembershipDALFactory;
  orgMembershipDAL: TOrgMembershipDALFactory;
  groupDAL: Pick<TGroupDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
};

const $unpackProjectTemplate = (
  { roles, environments, projectManagedIdentities, ...rest }: TProjectTemplates,
  users: TProjectTemplateUser[],
  groups: TProjectTemplateGroup[],
  identities: TProjectTemplateOrgManagedIdentity[]
) => ({
  ...rest,
  environments: environments as TProjectTemplateEnvironment[],
  roles: [
    ...getPredefinedRoles({ projectId: "project-template", projectType: rest.type as ProjectType }).map(
      ({ name, slug, permissions }) => ({
        name,
        slug,
        permissions: permissions as TUnpackedPermission[]
      })
    ),
    ...(roles as TProjectTemplateRole[]).map((role) => ({
      ...role,
      permissions: unpackPermissions(role.permissions)
    }))
  ],
  users,
  groups,
  identities,
  projectManagedIdentities: (projectManagedIdentities as TProjectTemplateProjectManagedIdentity[]) || null
});

export const projectTemplateServiceFactory = ({
  licenseService,
  permissionService,
  orgMembershipDAL,
  projectTemplateDAL,
  projectTemplateUserMembershipDAL,
  projectTemplateGroupMembershipDAL,
  projectTemplateIdentityMembershipDAL,
  groupDAL,
  identityDAL
}: TProjectTemplatesServiceFactoryDep): TProjectTemplateServiceFactory => {
  // Helper to convert membership records to TProjectTemplateUser format
  const $membershipToUsers = (
    memberships: Awaited<ReturnType<typeof projectTemplateUserMembershipDAL.findByTemplateId>>
  ): TProjectTemplateUser[] => {
    return memberships.map((m) => ({
      username: m.username,
      roles: m.roles
    }));
  };

  // Helper to convert group membership records to TProjectTemplateGroup format
  const $membershipToGroups = (
    memberships: Awaited<ReturnType<typeof projectTemplateGroupMembershipDAL.findByTemplateId>>
  ): TProjectTemplateGroup[] => {
    return memberships.map((m) => ({
      groupSlug: m.groupSlug,
      roles: m.roles
    }));
  };

  // Helper to convert identity membership records to TProjectTemplateOrgManagedIdentity format
  const $membershipToIdentities = (
    memberships: Awaited<ReturnType<typeof projectTemplateIdentityMembershipDAL.findByTemplateId>>
  ): TProjectTemplateOrgManagedIdentity[] => {
    return memberships.map((m) => ({
      identityId: m.identityId,
      roles: m.roles
    }));
  };

  const listProjectTemplatesByOrg: TProjectTemplateServiceFactory["listProjectTemplatesByOrg"] = async (
    actor,
    type
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to access project templates due to plan restriction. Upgrade plan to access project templates."
      });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    const projectTemplates = await projectTemplateDAL.find({
      orgId: actor.orgId,
      ...(type ? { type } : {})
    });

    const templatesWithMembers = await Promise.all(
      projectTemplates.map(async (template) => {
        const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
          projectTemplateUserMembershipDAL.findByTemplateId(template.id),
          projectTemplateGroupMembershipDAL.findByTemplateId(template.id),
          projectTemplateIdentityMembershipDAL.findByTemplateId(template.id)
        ]);
        return $unpackProjectTemplate(
          template,
          $membershipToUsers(userMemberships),
          $membershipToGroups(groupMemberships),
          $membershipToIdentities(identityMemberships)
        );
      })
    );

    return [
      ...(type && type !== ProjectType.SSH
        ? [getDefaultProjectTemplate(actor.orgId, type)]
        : Object.values(ProjectType)
            // Filter out SSH since we're deprecating
            .filter((projectType) => projectType !== ProjectType.SSH)
            .map((projectType) => getDefaultProjectTemplate(actor.orgId, projectType))),
      ...templatesWithMembers
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

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: projectTemplate.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
      projectTemplateUserMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateGroupMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateIdentityMembershipDAL.findByTemplateId(projectTemplate.id)
    ]);
    const users = $membershipToUsers(userMemberships);
    const groups = $membershipToGroups(groupMemberships);
    const identities = $membershipToIdentities(identityMemberships);

    return {
      ...$unpackProjectTemplate(projectTemplate, users, groups, identities),
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

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: projectTemplate.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);

    const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
      projectTemplateUserMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateGroupMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateIdentityMembershipDAL.findByTemplateId(projectTemplate.id)
    ]);
    const users = $membershipToUsers(userMemberships);
    const groups = $membershipToGroups(groupMemberships);
    const identities = $membershipToIdentities(identityMemberships);

    return {
      ...$unpackProjectTemplate(projectTemplate, users, groups, identities),
      packedRoles: projectTemplate.roles as TProjectTemplateRole[] // preserve packed for when applying template
    };
  };

  const createProjectTemplate: TProjectTemplateServiceFactory["createProjectTemplate"] = async (
    { roles, environments, users, groups, identities, projectManagedIdentities, type, ...params },
    actor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to create project template due to plan restriction. Upgrade plan to access project templates."
      });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.ProjectTemplates);

    if (environments && type !== ProjectType.SecretManager) {
      throw new BadRequestError({ message: "Cannot configure environments for non-SecretManager project templates" });
    }

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

    // Validate that users exist and are members of the organization
    let validatedUsers: { membershipId: string; roles: string[] }[] = [];
    if (users?.length) {
      const orgMembers = await orgMembershipDAL.findOrgMembershipsWithUsersByOrgId(actor.orgId);
      const orgMemberUsernames = new Map(orgMembers.map((m) => [m.user.username.toLowerCase(), m] as const));

      const invalidUsers = users.filter((u) => !orgMemberUsernames.has(u.username.toLowerCase()));
      if (invalidUsers.length) {
        throw new BadRequestError({
          message: `The following users are not members of this organization: ${invalidUsers.map((u) => u.username).join(", ")}`
        });
      }

      const availableRoleSlugs = new Set([...Object.values(ProjectMembershipRole), ...roles.map((r) => r.slug)]);

      users.forEach((user) => {
        user.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `User "${user.username}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedUsers = users.map((u) => {
        const member = orgMemberUsernames.get(u.username.toLowerCase());
        return { membershipId: member!.id, roles: u.roles };
      });
    }

    // Validate groups exist in the organization
    let validatedGroups: { groupId: string; roles: string[] }[] = [];
    if (groups?.length) {
      const orgGroups = await groupDAL.find({ orgId: actor.orgId });
      const orgGroupBySlug = new Map(orgGroups.map((g) => [g.slug.toLowerCase(), g] as const));

      const invalidGroups = groups.filter((g) => !orgGroupBySlug.has(g.groupSlug.toLowerCase()));
      if (invalidGroups.length) {
        throw new BadRequestError({
          message: `The following groups do not exist in this organization: ${invalidGroups.map((g) => g.groupSlug).join(", ")}`
        });
      }

      const availableRoleSlugs = new Set([...Object.values(ProjectMembershipRole), ...roles.map((r) => r.slug)]);

      groups.forEach((group) => {
        group.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `Group "${group.groupSlug}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedGroups = groups.map((g) => {
        const group = orgGroupBySlug.get(g.groupSlug.toLowerCase());
        return { groupId: group!.id, roles: g.roles };
      });
    }

    // Validate org-managed identities exist in the organization
    let validatedIdentities: { identityId: string; roles: string[] }[] = [];
    if (identities?.length) {
      const orgIdentities = await identityDAL.find({ orgId: actor.orgId });
      const orgIdentityById = new Map(orgIdentities.map((i) => [i.id, i] as const));

      const invalidIdentities = identities.filter((i) => !orgIdentityById.has(i.identityId));
      if (invalidIdentities.length) {
        throw new BadRequestError({
          message: `The following identities do not exist in this organization: ${invalidIdentities.map((i) => i.identityId).join(", ")}`
        });
      }

      const availableRoleSlugs = new Set([...Object.values(ProjectMembershipRole), ...roles.map((r) => r.slug)]);

      identities.forEach((identity) => {
        identity.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `Identity "${identity.identityId}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedIdentities = identities.map((i) => ({
        identityId: i.identityId,
        roles: i.roles
      }));
    }

    // Validate project-managed identities have unique names
    if (projectManagedIdentities?.length) {
      const names = projectManagedIdentities.map((i) => i.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        throw new BadRequestError({
          message: "Project-managed identity names must be unique within the template"
        });
      }
    }

    const projectTemplateEnvironments =
      type === ProjectType.SecretManager && environments === undefined
        ? ProjectTemplateDefaultEnvironments
        : environments;

    const projectTemplate = await projectTemplateDAL.transaction(async (tx) => {
      const template = await projectTemplateDAL.create(
        {
          ...params,
          roles: JSON.stringify(roles.map((role) => ({ ...role, permissions: packRules(role.permissions) }))),
          environments: JSON.stringify(projectTemplateEnvironments),
          projectManagedIdentities: projectManagedIdentities?.length
            ? JSON.stringify(projectManagedIdentities)
            : undefined,
          orgId: actor.orgId,
          type
        },
        tx
      );

      if (validatedUsers.length) {
        await projectTemplateUserMembershipDAL.insertMany(
          validatedUsers.map((user) => ({
            projectTemplateId: template.id,
            membershipId: user.membershipId,
            roles: user.roles
          })),
          tx
        );
      }

      if (validatedGroups.length) {
        await projectTemplateGroupMembershipDAL.insertMany(
          validatedGroups.map((group) => ({
            projectTemplateId: template.id,
            groupId: group.groupId,
            roles: group.roles
          })),
          tx
        );
      }

      if (validatedIdentities.length) {
        await projectTemplateIdentityMembershipDAL.insertMany(
          validatedIdentities.map((identity) => ({
            projectTemplateId: template.id,
            identityId: identity.identityId,
            roles: identity.roles
          })),
          tx
        );
      }

      return template;
    });

    const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
      projectTemplateUserMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateGroupMembershipDAL.findByTemplateId(projectTemplate.id),
      projectTemplateIdentityMembershipDAL.findByTemplateId(projectTemplate.id)
    ]);
    return $unpackProjectTemplate(
      projectTemplate,
      $membershipToUsers(userMemberships),
      $membershipToGroups(groupMemberships),
      $membershipToIdentities(identityMemberships)
    );
  };

  const updateProjectTemplateById: TProjectTemplateServiceFactory["updateProjectTemplateById"] = async (
    id,
    { roles, environments, users, groups, identities, projectManagedIdentities, ...params },
    actor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to update project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findById(id);

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with ID ${id}` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: projectTemplate.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates);
    if (projectTemplate.type !== ProjectType.SecretManager && environments)
      throw new BadRequestError({ message: "Cannot configure environments for non-SecretManager project templates" });

    if (projectTemplate.type === ProjectType.SecretManager && environments === null)
      throw new BadRequestError({ message: "Environments cannot be removed for SecretManager project templates" });

    if (environments && plan.environmentLimit !== null && environments.length > plan.environmentLimit) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        message: `Failed to update project template due to environment count exceeding your current limit of ${plan.environmentLimit}. Contact Infisical to increase limit.`
      });
    }

    // Validate that users exist and are members of the organization
    let validatedUsers: { membershipId: string; roles: string[] }[] | undefined;
    if (users) {
      const orgMembers = await orgMembershipDAL.findOrgMembershipsWithUsersByOrgId(projectTemplate.orgId);
      const orgMemberUsernames = new Map(orgMembers.map((m) => [m.user.username.toLowerCase(), m] as const));

      const invalidUsers = users.filter((u) => !orgMemberUsernames.has(u.username.toLowerCase()));
      if (invalidUsers.length) {
        throw new BadRequestError({
          message: `The following users are not members of this organization: ${invalidUsers.map((u) => u.username).join(", ")}`
        });
      }

      const templateRoles = roles ?? (projectTemplate.roles as TProjectTemplateRole[]);
      const availableRoleSlugs = new Set([
        ...Object.values(ProjectMembershipRole),
        ...templateRoles.map((r) => r.slug)
      ]);

      users.forEach((user) => {
        user.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `User "${user.username}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedUsers = users.map((u) => {
        const member = orgMemberUsernames.get(u.username.toLowerCase());
        return { membershipId: member!.id, roles: u.roles };
      });
    } else if (users === null) {
      validatedUsers = [];
    }

    // Validate that groups exist in the organization
    let validatedGroups: { groupId: string; roles: string[] }[] | undefined;
    if (groups) {
      const orgGroups = await groupDAL.find({ orgId: projectTemplate.orgId });
      const orgGroupBySlug = new Map(orgGroups.map((g) => [g.slug.toLowerCase(), g] as const));

      const invalidGroups = groups.filter((g) => !orgGroupBySlug.has(g.groupSlug.toLowerCase()));
      if (invalidGroups.length) {
        throw new BadRequestError({
          message: `The following groups do not exist in this organization: ${invalidGroups.map((g) => g.groupSlug).join(", ")}`
        });
      }

      const templateRoles = roles ?? (projectTemplate.roles as TProjectTemplateRole[]);
      const availableRoleSlugs = new Set([
        ...Object.values(ProjectMembershipRole),
        ...templateRoles.map((r) => r.slug)
      ]);

      groups.forEach((group) => {
        group.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `Group "${group.groupSlug}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedGroups = groups.map((g) => {
        const group = orgGroupBySlug.get(g.groupSlug.toLowerCase());
        return { groupId: group!.id, roles: g.roles };
      });
    } else if (groups === null) {
      validatedGroups = [];
    }

    // Validate org-managed identities exist in the organization
    let validatedIdentities: { identityId: string; roles: string[] }[] | undefined = [];
    if (identities) {
      const orgIdentities = await identityDAL.find({ orgId: projectTemplate.orgId });
      const orgIdentityById = new Map(orgIdentities.map((i) => [i.id, i] as const));

      const invalidIdentities = identities.filter((i) => !orgIdentityById.has(i.identityId));
      if (invalidIdentities.length) {
        throw new BadRequestError({
          message: `The following identities do not exist in this organization: ${invalidIdentities.map((i) => i.identityId).join(", ")}`
        });
      }

      const templateRoles = roles ?? (projectTemplate.roles as TProjectTemplateRole[]);
      const availableRoleSlugs = new Set([
        ...Object.values(ProjectMembershipRole),
        ...templateRoles.map((r) => r.slug)
      ]);

      identities.forEach((identity) => {
        identity.roles.forEach((roleSlug) => {
          if (!availableRoleSlugs.has(roleSlug)) {
            throw new BadRequestError({
              message: `Identity "${identity.identityId}" references invalid role slug "${roleSlug}". Role must be a predefined role or defined in the template roles.`
            });
          }
        });
      });

      validatedIdentities = identities.map((i) => ({
        identityId: i.identityId,
        roles: i.roles
      }));
    } else if (identities === null) {
      validatedIdentities = [];
    }

    // Validate project-managed identities have unique names
    if (projectManagedIdentities) {
      const names = projectManagedIdentities.map((i) => i.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        throw new BadRequestError({
          message: "Project-managed identity names must be unique within the template"
        });
      }
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

    const updatedProjectTemplate = await projectTemplateDAL.transaction(async (tx) => {
      const hasTemplateUpdates =
        Object.keys(params).length > 0 ||
        roles !== undefined ||
        environments !== undefined ||
        projectManagedIdentities !== undefined;

      let template = projectTemplate;
      if (hasTemplateUpdates) {
        template = await projectTemplateDAL.updateById(
          id,
          {
            ...params,
            roles: roles
              ? JSON.stringify(roles.map((role) => ({ ...role, permissions: packRules(role.permissions) })))
              : undefined,
            environments: environments ? JSON.stringify(environments) : undefined,
            projectManagedIdentities: projectManagedIdentities
              ? JSON.stringify(projectManagedIdentities)
              : projectManagedIdentities
          },
          tx
        );
      }

      if (validatedUsers !== undefined) {
        await projectTemplateUserMembershipDAL.delete({ projectTemplateId: id }, tx);

        if (validatedUsers.length) {
          await projectTemplateUserMembershipDAL.insertMany(
            validatedUsers.map((user) => ({
              projectTemplateId: id,
              membershipId: user.membershipId,
              roles: user.roles
            })),
            tx
          );
        }
      }

      if (validatedGroups !== undefined) {
        await projectTemplateGroupMembershipDAL.delete({ projectTemplateId: id }, tx);

        if (validatedGroups.length) {
          await projectTemplateGroupMembershipDAL.insertMany(
            validatedGroups.map((group) => ({
              projectTemplateId: id,
              groupId: group.groupId,
              roles: group.roles
            })),
            tx
          );
        }
      }

      if (validatedIdentities !== undefined) {
        await projectTemplateIdentityMembershipDAL.delete({ projectTemplateId: id }, tx);

        if (validatedIdentities.length) {
          await projectTemplateIdentityMembershipDAL.insertMany(
            validatedIdentities.map((identity) => ({
              projectTemplateId: id,
              identityId: identity.identityId,
              roles: identity.roles
            })),
            tx
          );
        }
      }

      return template;
    });

    const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
      projectTemplateUserMembershipDAL.findByTemplateId(updatedProjectTemplate.id),
      projectTemplateGroupMembershipDAL.findByTemplateId(updatedProjectTemplate.id),
      projectTemplateIdentityMembershipDAL.findByTemplateId(updatedProjectTemplate.id)
    ]);
    return $unpackProjectTemplate(
      updatedProjectTemplate,
      $membershipToUsers(userMemberships),
      $membershipToGroups(groupMemberships),
      $membershipToIdentities(identityMemberships)
    );
  };

  const deleteProjectTemplateById: TProjectTemplateServiceFactory["deleteProjectTemplateById"] = async (id, actor) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.projectTemplates)
      throw new BadRequestError({
        message: "Failed to delete project template due to plan restriction. Upgrade plan to access project templates."
      });

    const projectTemplate = await projectTemplateDAL.findById(id);

    if (!projectTemplate) throw new NotFoundError({ message: `Could not find project template with ID ${id}` });

    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: projectTemplate.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.ProjectTemplates);

    const [userMemberships, groupMemberships, identityMemberships] = await Promise.all([
      projectTemplateUserMembershipDAL.findByTemplateId(id),
      projectTemplateGroupMembershipDAL.findByTemplateId(id),
      projectTemplateIdentityMembershipDAL.findByTemplateId(id)
    ]);
    const users = $membershipToUsers(userMemberships);
    const groups = $membershipToGroups(groupMemberships);
    const identities = $membershipToIdentities(identityMemberships);

    const deletedProjectTemplate = await projectTemplateDAL.deleteById(id);

    return $unpackProjectTemplate(deletedProjectTemplate, users, groups, identities);
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
