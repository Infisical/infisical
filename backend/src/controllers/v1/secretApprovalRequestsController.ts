import { Request, Response } from "express";
import { getUserProjectPermissions } from "../../ee/services/ProjectRoleService";
import { validateRequest } from "../../helpers/validation";
import { Folder } from "../../models";
import { ApprovalStatus, SecretApprovalRequest } from "../../models/secretApprovalRequest";
import * as reqValidator from "../../validation/secretApprovalRequest";
import { getFolderWithPathFromId } from "../../services/FolderService";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { ISecretApprovalPolicy } from "../../models/secretApprovalPolicy";
import { performSecretApprovalRequestMerge } from "../../services/SecretApprovalService";

export const getSecretApprovalRequests = async (req: Request, res: Response) => {
  const {
    query: { status, committer, workspaceId, environment, limit, offset }
  } = await validateRequest(reqValidator.getSecretApprovalRequests, req);

  const { membership } = await getUserProjectPermissions(req.user._id, workspaceId);

  const query = {
    workspace: workspaceId,
    environment,
    committer,
    status,
    ...(membership.role !== "admin"
      ? { $or: [{ committer: membership.id }, { "policy.approvers": membership.id }] }
      : {})
  };
  // to strip of undefined in query we use es6 spread to ignore those fields
  Object.entries(query).forEach(
    ([key, value]) => value === undefined && delete query[key as keyof typeof query]
  );
  const approvalRequests = await SecretApprovalRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset)
    .populate("policy")
    .lean();
  if (!approvalRequests.length) return res.send({ requests: [] });

  const unqiueEnvs = environment ?? {
    $in: [...new Set(approvalRequests.map(({ environment }) => environment))]
  };
  const approvalRootFolders = await Folder.find({
    workspace: workspaceId,
    environment: unqiueEnvs
  }).lean();

  const formatedApprovals = approvalRequests.map((el) => {
    let secretPath = "/";
    const folders = approvalRootFolders.find(({ environment }) => environment === el.environment);
    if (folders) {
      secretPath = getFolderWithPathFromId(folders?.nodes, el.folderId)?.folderPath || "/";
    }
    return { ...el, secretPath };
  });

  return res.send({
    approvals: formatedApprovals
  });
};

export const getSecretApprovalRequestDetails = async (req: Request, res: Response) => {
  const {
    params: { id }
  } = await validateRequest(reqValidator.getSecretApprovalRequestDetails, req);
  const secretApprovalRequest = await SecretApprovalRequest.findById(id)
    .populate("policy")
    .populate({
      path: "commits.secretVersion",
      populate: {
        path: "tags"
      }
    })
    .populate("commits.secret", "version")
    .populate("commits.newVersion.tags");
  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  const { membership } = await getUserProjectPermissions(
    req.user._id,
    secretApprovalRequest.workspace.toString()
  );
  // allow to fetch only if its admin or is the committer or approver
  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    secretApprovalRequest.reviewers.find(({ member }) => member === membership.id)
  ) {
    throw UnauthorizedRequestError({ message: "User has no access" });
  }

  return res.send({
    approval: secretApprovalRequest
  });
};

export const updateSecretApprovalRequestStatus = async (req: Request, res: Response) => {
  const {
    body: { status },
    params: { id }
  } = await validateRequest(reqValidator.updateSecretApprovalRequestStatus, req);
  const secretApprovalRequest = await SecretApprovalRequest.findById(id).populate<{
    policy: ISecretApprovalPolicy;
  }>("policy");
  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  const { membership } = await getUserProjectPermissions(
    req.user._id,
    secretApprovalRequest.workspace.toString()
  );
  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find((approverId) => approverId === membership.id)
  ) {
    throw UnauthorizedRequestError({ message: "User has no access" });
  }

  const reviewerPos = secretApprovalRequest.reviewers.findIndex(
    ({ member }) => member.toString() === membership._id.toString()
  );
  if (reviewerPos !== -1) {
    secretApprovalRequest.reviewers[reviewerPos].status = status;
  } else {
    secretApprovalRequest.reviewers.push({ member: membership._id, status });
  }
  await secretApprovalRequest.save();

  return res.send({ status });
};

export const mergeSecretApprovalRequest = async (req: Request, res: Response) => {
  const {
    body: { id }
  } = await validateRequest(reqValidator.mergeSecretApprovalRequest, req);

  const secretApprovalRequest = await SecretApprovalRequest.findById(id).populate<{
    policy: ISecretApprovalPolicy;
  }>("policy");

  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  const { membership } = await getUserProjectPermissions(
    req.user._id,
    secretApprovalRequest.workspace.toString()
  );
  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find((approverId) => approverId === membership.id)
  ) {
    throw UnauthorizedRequestError({ message: "User has no access" });
  }

  const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>(
    (prev, curr) => ({ ...prev, [curr.member.toString()]: curr.status }),
    {}
  );
  const hasMinApproval =
    secretApprovalRequest.policy.approvals <=
    secretApprovalRequest.policy.approvers.filter(
      (approverId) => reviewers[approverId.toString()] === ApprovalStatus.APPROVED
    ).length;

  if (!hasMinApproval) throw BadRequestError({ message: "Doesn't have minimum approvals needed" });

  const approval = await performSecretApprovalRequestMerge(id, req.authData);
  return res.send({ approval });
};
