import { ACCEPTED, MEMBER } from "../variables";
import { IUser, Key, Membership, MembershipOrg, User, Workspace } from "../models";
import type { ObjectId } from "mongodb";

export const getInvitee = async (email: string) => {
  const invitee = await User.findOne({
    email
  }).select("+publicKey");

  if (!invitee || !invitee?.publicKey) throw new Error("Failed to validate invitee");

  return invitee;
};

export const checkIsInviteeAlreadyAMember = async ({
  workspaceId,
  inviteeId
}: {
  workspaceId: string;
  inviteeId: ObjectId;
}) => {
  const inviteeMembership = await Membership.findOne({
    user: inviteeId,
    workspace: workspaceId
  }).populate<{ user: IUser }>("user");

  if (inviteeMembership) throw new Error("Failed to add existing member of workspace");
};

export const checkIsMemberAccepted = async ({
  workspaceId,
  inviteeId
}: {
  workspaceId: string;
  inviteeId: ObjectId;
}) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new Error("Failed to find workspace");
  // validate invitee's organization membership - ensure that only
  // (accepted) organization members can be added to the workspace
  const membershipOrg = await MembershipOrg.findOne({
    user: inviteeId,
    organization: workspace.organization,
    status: ACCEPTED
  });

  if (!membershipOrg) throw new Error("Failed to validate invitee's organization membership");

  return { workspace };
};

export const addMemberToTheWorkspace = async ({
  workspaceId,
  inviteeId,
  userId
}: {
  workspaceId: string;
  inviteeId: ObjectId;
  userId: string;
}) => {
  // validate invitee's workspace membership - ensure member isn't
  // already a member of the workspace
  await checkIsInviteeAlreadyAMember({ inviteeId, workspaceId });

  // validate invitee's organization membership - ensure that only
  // (accepted) organization members can be added to the workspace
  const { workspace } = await checkIsMemberAccepted({ inviteeId, workspaceId });

  // get latest key
  const latestKey = await Key.findOne({
    workspace: workspaceId,
    receiver: userId
  })
    .sort({ createdAt: -1 })
    .populate("sender", "+publicKey");

  // create new workspace membership
  await new Membership({
    user: inviteeId,
    workspace: workspaceId,
    role: MEMBER
  }).save();
  return { workspace, latestKey };
};
