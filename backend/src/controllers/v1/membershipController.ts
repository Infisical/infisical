import { Request, Response } from "express";
import { Types } from "mongoose";
import { IUser, Key, Membership, MembershipOrg, User, Workspace } from "../../models";
import { EventType, Role } from "../../ee/models";
import { deleteMembership as deleteMember, findMembership } from "../../helpers/membership";
import { sendMail } from "../../helpers/nodemailer";
import { ACCEPTED, ADMIN, CUSTOM, MEMBER, VIEWER } from "../../variables";
import { getSiteURL } from "../../config";
import { EEAuditLogService } from "../../ee/services";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/membership";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { BadRequestError } from "../../utils/errors";
import { InviteUserToWorkspaceV1 } from "../../validation/workspace";

/**
 * Check that user is a member of workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const validateMembership = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.ValidateMembershipV1, req);

  // validate membership
  const membership = await findMembership({
    user: req.user._id,
    workspace: workspaceId
  });

  if (!membership) {
    throw new Error("Failed to validate membership");
  }

  return res.status(200).send({
    message: "Workspace membership confirmed"
  });
};

/**
 * Delete membership with id [membershipId]
 * @param req
 * @param res
 * @returns
 */
export const deleteMembership = async (req: Request, res: Response) => {
  const {
    params: { membershipId }
  } = await validateRequest(reqValidator.DeleteMembershipV1, req);

  // check if membership to delete exists
  const membershipToDelete = await Membership.findOne({
    _id: membershipId
  }).populate<{ user: IUser }>("user");

  if (!membershipToDelete) {
    throw new Error("Failed to delete workspace membership that doesn't exist");
  }

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    membershipToDelete.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Member
  );

  // delete workspace membership
  const deletedMembership = await deleteMember({
    membershipId: membershipToDelete._id.toString()
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.REMOVE_WORKSPACE_MEMBER,
      metadata: {
        userId: membershipToDelete.user._id.toString(),
        email: membershipToDelete.user.email
      }
    },
    {
      workspaceId: membershipToDelete.workspace
    }
  );

  return res.status(200).send({
    deletedMembership
  });
};

/**
 * Change and return workspace membership role
 * @param req
 * @param res
 * @returns
 */
export const changeMembershipRole = async (req: Request, res: Response) => {
  const {
    body: { role },
    params: { membershipId }
  } = await validateRequest(reqValidator.ChangeMembershipRoleV1, req);

  // validate target membership
  const membershipToChangeRole = await Membership.findById(membershipId).populate<{ user: IUser }>(
    "user"
  );

  if (!membershipToChangeRole) {
    throw new Error("Failed to find membership to change role");
  }

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    membershipToChangeRole.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Member
  );

  const isCustomRole = ![ADMIN, MEMBER, VIEWER].includes(role);
  if (isCustomRole) {
    const wsRole = await Role.findOne({
      slug: role,
      isOrgRole: false,
      workspace: membershipToChangeRole.workspace
    });
    if (!wsRole) throw BadRequestError({ message: "Role not found" });
    const membership = await Membership.findByIdAndUpdate(membershipId, {
      role: CUSTOM,
      customRole: wsRole
    });
    return res.status(200).send({
      membership
    });
  }

  const membership = await Membership.findByIdAndUpdate(
    membershipId,
    {
      $set: {
        role
      },
      $unset: {
        customRole: 1
      }
    },
    {
      new: true
    }
  );

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_USER_WORKSPACE_ROLE,
      metadata: {
        userId: membershipToChangeRole.user._id.toString(),
        email: membershipToChangeRole.user.email,
        oldRole: membershipToChangeRole.role,
        newRole: role
      }
    },
    {
      workspaceId: membershipToChangeRole.workspace
    }
  );

  return res.status(200).send({
    membership
  });
};

/**
 * Add user with email [email] to workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const inviteUserToWorkspace = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { email }
  } = await validateRequest(InviteUserToWorkspaceV1, req);
  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Member
  );

  const invitee = await User.findOne({
    email
  }).select("+publicKey");

  if (!invitee || !invitee?.publicKey) throw new Error("Failed to validate invitee");

  // validate invitee's workspace membership - ensure member isn't
  // already a member of the workspace
  const inviteeMembership = await Membership.findOne({
    user: invitee._id,
    workspace: workspaceId
  }).populate<{ user: IUser }>("user");

  if (inviteeMembership) throw new Error("Failed to add existing member of workspace");

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new Error("Failed to find workspace");
  // validate invitee's organization membership - ensure that only
  // (accepted) organization members can be added to the workspace
  const membershipOrg = await MembershipOrg.findOne({
    user: invitee._id,
    organization: workspace.organization,
    status: ACCEPTED
  });

  if (!membershipOrg) throw new Error("Failed to validate invitee's organization membership");

  // get latest key
  const latestKey = await Key.findOne({
    workspace: workspaceId,
    receiver: req.user._id
  })
    .sort({ createdAt: -1 })
    .populate("sender", "+publicKey");

  // create new workspace membership
  await new Membership({
    user: invitee._id,
    workspace: workspaceId,
    role: MEMBER
  }).save();

  await sendMail({
    template: "workspaceInvitation.handlebars",
    subjectLine: "Infisical workspace invitation",
    recipients: [invitee.email],
    substitutions: {
      inviterFirstName: req.user.firstName,
      inviterEmail: req.user.email,
      workspaceName: workspace.name,
      callback_url: (await getSiteURL()) + "/login"
    }
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.ADD_WORKSPACE_MEMBER,
      metadata: {
        userId: invitee._id.toString(),
        email: invitee.email
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.status(200).send({
    invitee,
    latestKey
  });
};
