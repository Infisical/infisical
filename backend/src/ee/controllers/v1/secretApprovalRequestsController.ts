import { Request, Response } from "express";
import { validateRequest } from "../../../helpers/validation";
import { Folder, Membership, User } from "../../../models";
import { ApprovalStatus, SecretApprovalRequest } from "../../models/secretApprovalRequest";
import * as reqValidator from "../../validation/secretApprovalRequest";
import { getFolderWithPathFromId } from "../../../services/FolderService";
import { BadRequestError, UnauthorizedRequestError } from "../../../utils/errors";
import { ISecretApprovalPolicy, SecretApprovalPolicy } from "../../models/secretApprovalPolicy";
import { performSecretApprovalRequestMerge } from "../../services/SecretApprovalService";
import { Types } from "mongoose";
import { EEAuditLogService } from "../../services";
import { EventType } from "../../models";

export const getSecretApprovalRequestCount = async (req: Request, res: Response) => {
  const {
    query: { workspaceId }
  } = await validateRequest(reqValidator.getSecretApprovalRequestCount, req);

  if (!(req.authData.authPayload instanceof User)) return;
  
  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: new Types.ObjectId(workspaceId)
  });
  
  if (!membership) throw UnauthorizedRequestError();

  const approvalRequestCount = await SecretApprovalRequest.aggregate([
    {
      $match: {
        workspace: new Types.ObjectId(workspaceId)
      }
    },
    {
      $lookup: {
        from: SecretApprovalPolicy.collection.name,
        localField: "policy",
        foreignField: "_id",
        as: "policy"
      }
    },
    { $unwind: "$policy" },
    ...(membership.role !== "admin"
      ? [
          {
            $match: {
              $or: [
                { committer: new Types.ObjectId(membership.id) },
                { "policy.approvers": new Types.ObjectId(membership.id) }
              ]
            }
          }
        ]
      : []),
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);
  const openRequests = approvalRequestCount.find(({ _id }) => _id === "open");
  const closedRequests = approvalRequestCount.find(({ _id }) => _id === "close");

  return res.send({
    approvals: { open: openRequests?.count || 0, closed: closedRequests?.count || 0 }
  });
};

export const getSecretApprovalRequests = async (req: Request, res: Response) => {
  const {
    query: { status, committer, workspaceId, environment, limit, offset }
  } = await validateRequest(reqValidator.getSecretApprovalRequests, req);

  if (!(req.authData.authPayload instanceof User)) return;
  
  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: new Types.ObjectId(workspaceId)
  });
  
  if (!membership) throw UnauthorizedRequestError();

  const query = {
    workspace: new Types.ObjectId(workspaceId),
    environment,
    committer: committer ? new Types.ObjectId(committer) : undefined,
    status
  };
  // to strip of undefined in query we use es6 spread to ignore those fields
  Object.entries(query).forEach(
    ([key, value]) => value === undefined && delete query[key as keyof typeof query]
  );
  const approvalRequests = await SecretApprovalRequest.aggregate([
    {
      $match: query
    },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: SecretApprovalPolicy.collection.name,
        localField: "policy",
        foreignField: "_id",
        as: "policy"
      }
    },
    { $unwind: "$policy" },
    ...(membership.role !== "admin"
      ? [
          {
            $match: {
              $or: [
                { committer: new Types.ObjectId(membership.id) },
                { "policy.approvers": new Types.ObjectId(membership.id) }
              ]
            }
          }
        ]
      : []),
    { $skip: offset },
    { $limit: limit }
  ]);
  if (!approvalRequests.length) return res.send({ approvals: [] });

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
    .populate<{ policy: ISecretApprovalPolicy }>("policy")
    .populate({
      path: "commits.secretVersion",
      populate: {
        path: "tags"
      }
    })
    .populate("commits.secret", "version")
    .populate("commits.newVersion.tags")
    .lean();
  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  if (!(req.authData.authPayload instanceof User)) return;

  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: secretApprovalRequest.workspace
  });
  
  if (!membership) throw UnauthorizedRequestError();

  // allow to fetch only if its admin or is the committer or approver
  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find(
      (approverId) => approverId.toString() === membership._id.toString()
    )
  ) {
    throw UnauthorizedRequestError({ message: "User has no access" });
  }

  let secretPath = "/";
  const approvalRootFolders = await Folder.findOne({
    workspace: secretApprovalRequest.workspace,
    environment: secretApprovalRequest.environment
  }).lean();
  if (approvalRootFolders) {
    secretPath =
      getFolderWithPathFromId(approvalRootFolders?.nodes, secretApprovalRequest.folderId)
        ?.folderPath || "/";
  }

  return res.send({
    approval: { ...secretApprovalRequest, secretPath }
  });
};

export const updateSecretApprovalReviewStatus = async (req: Request, res: Response) => {
  const {
    body: { status },
    params: { id }
  } = await validateRequest(reqValidator.updateSecretApprovalReviewStatus, req);
  const secretApprovalRequest = await SecretApprovalRequest.findById(id).populate<{
    policy: ISecretApprovalPolicy;
  }>("policy");
  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  if (!(req.authData.authPayload instanceof User)) return;

  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: secretApprovalRequest.workspace
  });
  
  if (!membership) throw UnauthorizedRequestError();

  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find((approverId) => approverId.equals(membership.id))
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
    params: { id }
  } = await validateRequest(reqValidator.mergeSecretApprovalRequest, req);

  const secretApprovalRequest = await SecretApprovalRequest.findById(id).populate<{
    policy: ISecretApprovalPolicy;
  }>("policy");

  if (!secretApprovalRequest)
    throw BadRequestError({ message: "Secret approval request not found" });

  if (!(req.authData.authPayload instanceof User)) return;

  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: secretApprovalRequest.workspace
  });
  
  if (!membership) throw UnauthorizedRequestError();

  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find((approverId) => approverId.equals(membership.id))
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

  const approval = await performSecretApprovalRequestMerge(
    id,
    req.authData,
    membership._id.toString()
  );
  return res.send({ approval });
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

  if (!(req.authData.authPayload instanceof User)) return;

  const membership = await Membership.findOne({
    user: req.authData.authPayload._id,
    workspace: secretApprovalRequest.workspace
  });
  
  if (!membership) throw UnauthorizedRequestError();

  if (
    membership.role !== "admin" &&
    secretApprovalRequest.committer !== membership.id &&
    !secretApprovalRequest.policy.approvers.find((approverId) => approverId.equals(membership._id))
  ) {
    throw UnauthorizedRequestError({ message: "User has no access" });
  }

  if (secretApprovalRequest.hasMerged)
    throw BadRequestError({ message: "Approval request has been merged" });
  if (secretApprovalRequest.status === "close" && status === "close")
    throw BadRequestError({ message: "Approval request is already closed" });
  if (secretApprovalRequest.status === "open" && status === "open")
    throw BadRequestError({ message: "Approval request is already open" });

  const updatedRequest = await SecretApprovalRequest.findByIdAndUpdate(
    id,
    { status, statusChangeBy: membership._id },
    { new: true }
  );

  if (status === "close") {
    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.SECRET_APPROVAL_CLOSED,
        metadata: {
          closedBy: membership._id.toString(),
          secretApprovalRequestId: id,
          secretApprovalRequestSlug: secretApprovalRequest.slug
        }
      },
      {
        workspaceId: secretApprovalRequest.workspace
      }
    );
  } else {
    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.SECRET_APPROVAL_REOPENED,
        metadata: {
          reopenedBy: membership._id.toString(),
          secretApprovalRequestId: id,
          secretApprovalRequestSlug: secretApprovalRequest.slug
        }
      },
      {
        workspaceId: secretApprovalRequest.workspace
      }
    );
  }
  return res.send({ approval: updatedRequest });
};
