import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Meter, TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { NotFoundError } from "@app/lib/errors";
import { lockAndAssertActiveOrgAccess } from "@app/services/org/org-access-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TAccessProjectDTO, TListOrgProjectsDTO } from "./org-admin-types";

type TOrgAdminServiceFactoryDep = {
  orgDAL: Pick<TOrgDALFactory, "lockActorsForOrgAccess" | "findActorsWithActiveOrgAccess">;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "findProjectGhostUser" | "findOne">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findAllProjectMembers">;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  licenseDomain: TLicenseDomain;
};

export type TOrgAdminServiceFactory = ReturnType<typeof orgAdminServiceFactory>;

export const orgAdminServiceFactory = ({
  organizationsDomain,
  projectDAL,
  projectMembershipDAL,
  smtpService,
  notificationService,
  membershipUserDAL,
  membershipRoleDAL,
  licenseDomain,
  orgDAL
}: TOrgAdminServiceFactoryDep) => {
  const listOrgProjects = async ({ actor, limit, offset, search }: TListOrgProjectsDTO) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });
    permission.assert({
      action: OrgPermissionAdminConsoleAction.AccessAllProjects,
      subject: OrgPermissionSubjects.AdminConsole
    });
    const projects = await projectDAL.find(
      {
        orgId: actor.org.id,
        $search: {
          name: search || undefined
        }
      },
      { offset, limit, sort: [["name", "asc"]], count: true }
    );

    const count = projects?.[0]?.count ? parseInt(projects?.[0]?.count, 10) : 0;
    return { projects, count };
  };

  const grantProjectAdminAccess = async ({ actor, projectId }: TAccessProjectDTO) => {
    const permission = await organizationsDomain.getOrgPermission({ actor });
    permission.assert({
      action: OrgPermissionAdminConsoleAction.AccessAllProjects,
      subject: OrgPermissionSubjects.AdminConsole
    });

    const actorId = actor.principal.id;
    const actorOrgId = actor.org.id;
    const project = await projectDAL.findOne({ id: projectId, orgId: actorOrgId });
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    // Reads inside this transaction so it sees the primary, not a possibly-lagging replica, in
    // case a caller (e.g. PAM's bootstrap) just wrote this actor's membership moments earlier.
    const { isExistingMember, membership: updatedMembership } = await membershipUserDAL.transaction(async (tx) => {
      await lockAndAssertActiveOrgAccess({ orgDAL, orgId: actorOrgId, userIds: [actorId] }, tx);
      const projectMembership = await membershipUserDAL.findOne(
        { scopeProjectId: projectId, scope: AccessScope.Project, actorUserId: actorId },
        tx
      );

      if (projectMembership) {
        await membershipRoleDAL.delete({ membershipId: projectMembership.id }, tx);
        await membershipRoleDAL.create({ membershipId: projectMembership.id, role: ProjectMembershipRole.Admin }, tx);
        return { isExistingMember: true, membership: projectMembership };
      }

      const newProjectMembership = await membershipUserDAL.create(
        {
          scopeProjectId: projectId,
          actorUserId: actorId,
          scope: AccessScope.Project,
          scopeOrgId: actorOrgId
        },
        tx
      );
      await membershipRoleDAL.create({ membershipId: newProjectMembership.id, role: ProjectMembershipRole.Admin }, tx);

      return { isExistingMember: false, membership: newProjectMembership };
    });

    if (isExistingMember) {
      return { isExistingMember: true, membership: updatedMembership };
    }

    // Agent Vault's project starts empty and admins join through here, so this is where its seat count moves.
    if (project.type === ProjectType.AgentVault) {
      licenseDomain.emit(project.orgId, Meter.AgentVaultIdentities.key);
    }

    const projectMembers = await projectMembershipDAL.findAllProjectMembers(projectId);
    const projectAdmins = projectMembers.filter(
      (member) => member.roles.some((role) => role.role === ProjectMembershipRole.Admin) && member.userId !== actorId
    );
    const mappedProjectAdmins = projectAdmins.map((el) => el.user.email!).filter(Boolean);
    const actorEmail = projectMembers.find((el) => el.userId === actorId)?.user?.username;

    if (actorEmail) {
      await notificationService.createUserNotifications(
        projectAdmins.map((member) => ({
          userId: member.userId,
          orgId: project.orgId,
          type: NotificationType.DIRECT_PROJECT_ACCESS_ISSUED_TO_ADMIN,
          title: "Direct Project Access Issued",
          body: `The organization admin **${actorEmail}** has self-issued direct access to the project **${project.name}**.`
        }))
      );

      if (mappedProjectAdmins.length) {
        await smtpService.sendMail({
          template: SmtpTemplates.OrgAdminProjectDirectAccess,
          recipients: mappedProjectAdmins,
          subjectLine: "Organization Admin Project Direct Access Issued",
          substitutions: {
            projectName: project.name,
            email: actorEmail
          }
        });
      }
    }
    return { isExistingMember: false, membership: updatedMembership };
  };

  return { listOrgProjects, grantProjectAdminAccess };
};
