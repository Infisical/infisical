import { ForbiddenError } from "@casl/ability";

import { OrgMembershipStatus, ProjectMembershipRole } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { TOrgDalFactory } from "../org/org-dal";
import { TProjectDalFactory } from "../project/project-dal";
import { TProjectKeyDalFactory } from "../project-key/project-key-dal";
import { TProjectRoleDalFactory } from "../project-role/project-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDalFactory } from "../user/user-dal";
import { TProjectMembershipDalFactory } from "./project-membership-dal";
import {
  TDeleteProjectMembershipDTO,
  TGetProjectMembershipDTO,
  TInviteUserToProjectDTO,
  TUpdateProjectMembershipDTO
} from "./project-membership-types";

type TProjectMembershipServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  smtpService: TSmtpService;
  projectMembershipDal: TProjectMembershipDalFactory;
  userDal: Pick<TUserDalFactory, "findById" | "findOne">;
  projectRoleDal: Pick<TProjectRoleDalFactory, "findOne">;
  orgDal: Pick<TOrgDalFactory, "findMembership">;
  projectDal: Pick<TProjectDalFactory, "findById">;
  projectKeyDal: Pick<TProjectKeyDalFactory, "findLatestProjectKey" | "delete">;
};

export type TProjectMembershipServiceFactory = ReturnType<typeof projectMembershipServiceFactory>;

export const projectMembershipServiceFactory = ({
  permissionService,
  projectMembershipDal,
  smtpService,
  projectRoleDal,
  orgDal,
  userDal,
  projectDal,
  projectKeyDal
}: TProjectMembershipServiceFactoryDep) => {
  const getProjectMemberships = async ({ actorId, actor, projectId }: TGetProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.Member
    );

    return projectMembershipDal.findAllProjectMembers(projectId);
  };

  const inviteUserToProject = async ({
    actorId,
    actor,
    projectId,
    email
  }: TInviteUserToProjectDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Member
    );

    const invitee = await userDal.findOne({ email });
    if (!invitee || !invitee.isAccepted)
      throw new BadRequestError({
        message: "Faield to validate invitee",
        name: "Invite user to project"
      });

    const inviteeMembership = await projectMembershipDal.findOne({
      userId: invitee.id,
      projectId
    });
    if (inviteeMembership)
      throw new BadRequestError({
        message: "Existing member of project",
        name: "Invite user to project"
      });

    const project = await projectDal.findById(projectId);
    const inviteeMembershipOrg = await orgDal.findMembership({
      userId: invitee.id,
      orgId: project.orgId,
      status: OrgMembershipStatus.Accepted
    });
    if (!inviteeMembershipOrg)
      throw new BadRequestError({
        message: "Failed to validate invitee org membership",
        name: "Invite user to project"
      });

    const latestKey = await projectKeyDal.findLatestProjectKey(actorId, projectId);
    await projectMembershipDal.create({
      userId: invitee.id,
      projectId,
      role: ProjectMembershipRole.Member
    });

    const sender = await userDal.findById(actorId);
    const appCfg = getConfig();
    await smtpService.sendMail({
      template: SmtpTemplates.WorkspaceInvite,
      subjectLine: "Infisical workspace invitation",
      recipients: [invitee.email],
      substitutions: {
        inviterFirstName: sender.firstName,
        inviterEmail: sender.email,
        workspaceName: project.name,
        callback_url: `${appCfg.SITE_URL}/login`
      }
    });

    // TODO(akhilmhdh-pg): Audit log
    return { invitee, latestKey };
  };

  const updateProjectMembership = async ({
    actorId,
    actor,
    projectId,
    membershipId,
    role
  }: TUpdateProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.Member
    );

    const isCustomRole = !Object.values(ProjectMembershipRole).includes(
      role as ProjectMembershipRole
    );
    if (isCustomRole) {
      const customRole = await projectRoleDal.findOne({ slug: role, projectId });
      if (!customRole)
        throw new BadRequestError({ name: "Update project membership", message: "Role not found" });
      const [membership] = await projectMembershipDal.update(
        { id: membershipId, projectId },
        {
          role: ProjectMembershipRole.Custom,
          roleId: customRole.id
        }
      );
      return membership;
    }

    const [membership] = await projectMembershipDal.update(
      { id: membershipId, projectId },
      { role, roleId: null }
    );
    return membership;
  };

  const deleteProjectMembership = async ({
    actorId,
    actor,
    projectId,
    membershipId
  }: TDeleteProjectMembershipDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.Member
    );

    const membership = await projectMembershipDal.transaction(async (tx) => {
      const [deletedMembership] = await projectMembershipDal.delete(
        { projectId, id: membershipId },
        tx
      );
      await projectKeyDal.delete({ receiverId: deletedMembership.userId, projectId }, tx);
      return deletedMembership;
    });
    return membership;
  };

  return {
    getProjectMemberships,
    inviteUserToProject,
    updateProjectMembership,
    deleteProjectMembership
  };
};
