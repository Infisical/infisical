import { ForbiddenError } from "@casl/ability";

import { OrgMembershipStatus, ProjectMembershipRole, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";

import { TOrgDalFactory } from "../org/org-dal";
import { TProjectDalFactory } from "../project/project-dal";
import { TProjectKeyDalFactory } from "../project-key/project-key-dal";
import { TProjectRoleDalFactory } from "../project-role/project-role-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDalFactory } from "../user/user-dal";
import { TProjectMembershipDalFactory } from "./project-membership-dal";
import {
  TAddUsersToWorkspaceDTO,
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
  projectKeyDal: Pick<TProjectKeyDalFactory, "findLatestProjectKey" | "delete" | "insertMany">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
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
  projectKeyDal,
  licenseService
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

    return { invitee, latestKey };
  };

  const addUsersToProject = async ({
    projectId,
    actorId,
    actor,
    members
  }: TAddUsersToWorkspaceDTO) => {
    const project = await projectDal.findById(projectId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.Member
    );
    const orgMembers = await orgDal.findMembership({
      orgId: project.orgId,
      $in: {
        [`${TableName.OrgMembership}.id` as "id"]: members.map(
          ({ orgMembershipId }) => orgMembershipId
        )
      }
    });
    if (orgMembers.length !== members.length)
      throw new BadRequestError({ message: "Some users are not part of org" });

    const existingMembers = await projectMembershipDal.find({
      projectId,
      $in: { userId: orgMembers.map(({ userId }) => userId).filter(Boolean) as string[] }
    });
    if (existingMembers.length)
      throw new BadRequestError({ message: "Some users are already part of project" });

    await projectMembershipDal.transaction(async (tx) => {
      await projectMembershipDal.insertMany(
        orgMembers.map(({ userId }) => ({
          projectId,
          userId: userId as string,
          role: ProjectMembershipRole.Member
        })),
        tx
      );
      const encKeyGroupByOrgMembId = groupBy(members, (i) => i.orgMembershipId);
      await projectKeyDal.insertMany(
        orgMembers.map(({ userId, id }) => ({
          encryptedKey: encKeyGroupByOrgMembId[id][0].workspaceEncryptedKey,
          nonce: encKeyGroupByOrgMembId[id][0].workspaceEncryptedNonce,
          senderId: actorId,
          receiverId: userId as string,
          projectId
        })),
        tx
      );
    });
    const sender = await userDal.findById(actorId);
    const appCfg = getConfig();
    await smtpService.sendMail({
      template: SmtpTemplates.WorkspaceInvite,
      subjectLine: "Infisical workspace invitation",
      recipients: orgMembers.map(({ email }) => email).filter(Boolean) as string[],
      substitutions: {
        inviterFirstName: sender.firstName,
        inviterEmail: sender.email,
        workspaceName: project.name,
        callback_url: `${appCfg.SITE_URL}/login`
      }
    });
    return orgMembers;
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
      const project = await projectDal.findById(customRole.projectId);
      const plan = await licenseService.getPlan(project.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });

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
    deleteProjectMembership,
    addUsersToProject
  };
};
