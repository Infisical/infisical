import { ForbiddenError } from "@casl/ability";

import { ProjectMembershipRole, ProjectVersion } from "@app/db/schemas";
import { OrgPermissionAdminConsoleAction, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotDALFactory } from "../project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectUserMembershipRoleDALFactory } from "../project-membership/project-user-membership-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TAccessProjectDTO, TListOrgProjectsDTO } from "./org-admin-types";

type TOrgAdminServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "findProjectGhostUser" | "findOne">;
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    "findOne" | "create" | "transaction" | "delete" | "findAllProjectMembers"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "findLatestProjectKey" | "create">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectUserMembershipRoleDAL: Pick<TProjectUserMembershipRoleDALFactory, "create" | "delete">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TOrgAdminServiceFactory = ReturnType<typeof orgAdminServiceFactory>;

export const orgAdminServiceFactory = ({
  permissionService,
  projectDAL,
  projectMembershipDAL,
  projectKeyDAL,
  projectBotDAL,
  projectUserMembershipRoleDAL,
  smtpService
}: TOrgAdminServiceFactoryDep) => {
  const listOrgProjects = async ({
    actor,
    limit,
    actorId,
    offset,
    search,
    actorOrgId,
    actorAuthMethod
  }: TListOrgProjectsDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAdminConsoleAction.AccessAllProjects,
      OrgPermissionSubjects.AdminConsole
    );
    const projects = await projectDAL.find(
      {
        orgId: actorOrgId,
        $search: {
          name: search ? `%${search}%` : undefined
        }
      },
      { offset, limit, sort: [["name", "asc"]], count: true }
    );

    const count = projects?.[0]?.count ? parseInt(projects?.[0]?.count, 10) : 0;
    return { projects, count };
  };

  const grantProjectAdminAccess = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TAccessProjectDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAdminConsoleAction.AccessAllProjects,
      OrgPermissionSubjects.AdminConsole
    );

    const project = await projectDAL.findOne({ id: projectId, orgId: actorOrgId });
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    if (project.version === ProjectVersion.V1) {
      throw new BadRequestError({ message: "Please upgrade your project on your dashboard" });
    }

    // check already there exist a membership if there return it
    const projectMembership = await projectMembershipDAL.findOne({
      projectId,
      userId: actorId
    });
    if (projectMembership) {
      // reset and make the user admin
      await projectMembershipDAL.transaction(async (tx) => {
        await projectUserMembershipRoleDAL.delete({ projectMembershipId: projectMembership.id }, tx);
        await projectUserMembershipRoleDAL.create(
          {
            projectMembershipId: projectMembership.id,
            role: ProjectMembershipRole.Admin
          },
          tx
        );
      });
      return { isExistingMember: true, membership: projectMembership };
    }

    // missing membership thus add admin back as admin to project
    const ghostUser = await projectDAL.findProjectGhostUser(projectId);
    if (!ghostUser) {
      throw new NotFoundError({
        message: `Project owner of project with ID '${projectId}' not found`
      });
    }

    const ghostUserLatestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId);
    if (!ghostUserLatestKey) {
      throw new NotFoundError({
        message: `Project owner's latest key of project with ID '${projectId}' not found`
      });
    }

    const bot = await projectBotDAL.findOne({ projectId });
    if (!bot) {
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found`
      });
    }

    const updatedMembership = await projectMembershipDAL.transaction(async (tx) => {
      const newProjectMembership = await projectMembershipDAL.create(
        {
          projectId,
          userId: actorId
        },
        tx
      );
      await projectUserMembershipRoleDAL.create(
        { projectMembershipId: newProjectMembership.id, role: ProjectMembershipRole.Admin },
        tx
      );

      return newProjectMembership;
    });

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
    const filteredProjectMembers = projectMembers
      .filter(
        (member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin) && member.userId !== actorId
      )
      .map((el) => el.user.email!)
      .filter(Boolean);

    if (filteredProjectMembers.length) {
      await smtpService.sendMail({
        template: SmtpTemplates.OrgAdminProjectDirectAccess,
        recipients: filteredProjectMembers,
        subjectLine: "Organization Admin Project Direct Access Issued",
        substitutions: {
          projectName: project.name,
          email: projectMembers.find((el) => el.userId === actorId)?.user?.username
        }
      });
    }
    return { isExistingMember: false, membership: updatedMembership };
  };

  return { listOrgProjects, grantProjectAdminAccess };
};
