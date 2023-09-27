import { ForbiddenError } from "@casl/ability";
import { Request, Response } from "express";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { validateRequest } from "../../helpers/validation";
import { SecretApproval } from "../../models/secretApproval";
import { BadRequestError } from "../../utils/errors";
import * as reqValidator from "../../validation/secretApproval";

const ERR_SECRET_APPROVAL_NOT_FOUND = BadRequestError({ message: "secret approval not found" });

export const createSecretApprovalRule = async (req: Request, res: Response) => {
  const {
    body: { approvals, secretPath, approvers, environment, workspaceId }
  } = await validateRequest(reqValidator.CreateSecretApprovalRule, req);

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );

  const secretApproval = new SecretApproval({
    workspace: workspaceId,
    secretPath,
    environment,
    approvals,
    approvers
  });
  await secretApproval.save();

  return res.send({
    approval: secretApproval
  });
};

export const updateSecretApprovalRule = async (req: Request, res: Response) => {
  const {
    body: { approvals, approvers, secretPath },
    params: { id }
  } = await validateRequest(reqValidator.UpdateSecretApprovalRule, req);

  const secretApproval = await SecretApproval.findById(id);
  if (!secretApproval) throw ERR_SECRET_APPROVAL_NOT_FOUND;

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    secretApproval.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.SecretApproval
  );

  const updatedDoc = await SecretApproval.findByIdAndUpdate(id, {
    approvals,
    approvers,
    $set: secretPath === "-" ? undefined : { secretPath }
  });

  return res.send({
    approval: updatedDoc
  });
};

export const deleteSecretApprovalRule = async (req: Request, res: Response) => {
  const {
    params: { id }
  } = await validateRequest(reqValidator.DeleteSecretApprovalRule, req);

  const secretApproval = await SecretApproval.findById(id);
  if (!secretApproval) throw ERR_SECRET_APPROVAL_NOT_FOUND;

  const { permission } = await getUserProjectPermissions(
    req.user._id,
    secretApproval.workspace.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.SecretApproval
  );

  const deletedDoc = await SecretApproval.findByIdAndDelete(id);

  return res.send({
    approval: deletedDoc
  });
};

export const getSecretApprovalRules = async (req: Request, res: Response) => {
  const {
    query: { workspaceId }
  } = await validateRequest(reqValidator.GetSecretApprovalRuleList, req);

  const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );

  const doc = await SecretApproval.find({ workspace: workspaceId });

  return res.send({
    approvals: doc
  });
};
