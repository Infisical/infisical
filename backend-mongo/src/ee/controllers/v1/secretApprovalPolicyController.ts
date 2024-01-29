import { Types } from "mongoose";
import { ForbiddenError, subject } from "@casl/ability";
import { Request, Response } from "express";
import { nanoid } from "nanoid";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import { validateRequest } from "../../../helpers/validation";
import { SecretApprovalPolicy } from "../../models/secretApprovalPolicy";
import { getSecretPolicyOfBoard } from "../../services/SecretApprovalService";
import { BadRequestError } from "../../../utils/errors";
import * as reqValidator from "../../validation/secretApproval";

const ERR_SECRET_APPROVAL_NOT_FOUND = BadRequestError({ message: "secret approval not found" });

export const createSecretApprovalPolicy = async (req: Request, res: Response) => {
  const {
    body: { approvals, secretPath, approvers, environment, workspaceId, name }
  } = await validateRequest(reqValidator.CreateSecretApprovalRule, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );

  const secretApproval = new SecretApprovalPolicy({
    workspace: workspaceId,
    name: name ?? `${environment}-${nanoid(3)}`,
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

export const updateSecretApprovalPolicy = async (req: Request, res: Response) => {
  const {
    body: { approvals, approvers, secretPath, name },
    params: { id }
  } = await validateRequest(reqValidator.UpdateSecretApprovalRule, req);

  const secretApproval = await SecretApprovalPolicy.findById(id);
  if (!secretApproval) throw ERR_SECRET_APPROVAL_NOT_FOUND;

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: secretApproval.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.SecretApproval
  );

  const updatedDoc = await SecretApprovalPolicy.findByIdAndUpdate(id, {
    approvals,
    approvers,
    name: (name || secretApproval?.name) ?? `${secretApproval.environment}-${nanoid(3)}`,
    ...(secretPath === null ? { $unset: { secretPath: 1 } } : { secretPath })
  });

  return res.send({
    approval: updatedDoc
  });
};

export const deleteSecretApprovalPolicy = async (req: Request, res: Response) => {
  const {
    params: { id }
  } = await validateRequest(reqValidator.DeleteSecretApprovalRule, req);

  const secretApproval = await SecretApprovalPolicy.findById(id);
  if (!secretApproval) throw ERR_SECRET_APPROVAL_NOT_FOUND;

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: secretApproval.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.SecretApproval
  );

  const deletedDoc = await SecretApprovalPolicy.findByIdAndDelete(id);

  return res.send({
    approval: deletedDoc
  });
};

export const getSecretApprovalPolicy = async (req: Request, res: Response) => {
  const {
    query: { workspaceId }
  } = await validateRequest(reqValidator.GetSecretApprovalRuleList, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );

  const doc = await SecretApprovalPolicy.find({ workspace: workspaceId });

  return res.send({
    approvals: doc
  });
};

export const getSecretApprovalPolicyOfBoard = async (req: Request, res: Response) => {
  const {
    query: { workspaceId, environment, secretPath }
  } = await validateRequest(reqValidator.GetSecretApprovalPolicyOfABoard, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    subject(ProjectPermissionSub.Secrets, { secretPath, environment })
  );

  const secretApprovalPolicy = await getSecretPolicyOfBoard(workspaceId, environment, secretPath);
  return res.send({ policy: secretApprovalPolicy });
};
