import { ForbiddenError } from "@casl/ability";
import { Request, Response } from "express";
import { Types } from "mongoose";

import { getSiteURL } from "../../config";
import { EventType } from "../../ee/models";
import { EEAuditLogService } from "../../ee/services";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { sendMail } from "../../helpers";
import { validateRequest } from "../../helpers/validation";
import { IUser, Key, Membership, MembershipOrg, Workspace } from "../../models";
import { BadRequestError } from "../../utils/errors";
import * as reqValidator from "../../validation/membership";
import { ACCEPTED, MEMBER } from "../../variables";

export const addUserToWorkspace = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { members }
  } = await validateRequest(reqValidator.AddUserToWorkspaceV2, req);
  // check workspace
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new Error("Failed to find workspace");

  // check permission
  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Member
  );

  // validate members are part of the organization
  const orgMembers = await MembershipOrg.find({
    status: ACCEPTED,
    _id: { $in: members.map(({ orgMembershipId }) => orgMembershipId) },
    organization: workspace.organization
  })
    .populate<{ user: IUser }>("user")
    .select({ _id: 1, user: 1 })
    .lean();
  if (orgMembers.length !== members.length)
    throw BadRequestError({ message: "Org member not found" });

  const existingMember = await Membership.find({
    workspace: workspaceId,
    user: { $in: orgMembers.map(({ user }) => user) }
  });
  if (existingMember?.length)
    throw BadRequestError({ message: "Some users are already part of workspace" });

  await Membership.insertMany(
    orgMembers.map(({ user }) => ({ user: user._id, workspace: workspaceId, role: MEMBER }))
  );

  const encKeyGroupedByOrgMemberId = members.reduce<Record<string, (typeof members)[number]>>(
    (prev, curr) => ({ ...prev, [curr.orgMembershipId]: curr }),
    {}
  );
  await Key.insertMany(
    orgMembers.map(({ user, _id: id }) => ({
      encryptedKey: encKeyGroupedByOrgMemberId[id.toString()].workspaceEncryptedKey,
      nonce: encKeyGroupedByOrgMemberId[id.toString()].workspaceEncryptedNonce,
      sender: req.user._id,
      receiver: user._id,
      workspace: workspaceId
    }))
  );

  await sendMail({
    template: "workspaceInvitation.handlebars",
    subjectLine: "Infisical workspace invitation",
    recipients: orgMembers.map(({ user }) => user.email),
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
      type: EventType.ADD_BATCH_WORKSPACE_MEMBER,
      metadata: orgMembers.map(({ user }) => ({
        userId: user._id.toString(),
        email: user.email
      }))
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.status(200).send({
    success: true,
    data: orgMembers
  });
};
