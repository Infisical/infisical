import { Request, Response } from "express";
import { Types } from "mongoose";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../validation/secretRotation";
import * as secretRotationService from "../../secretRotation/service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";

export const createSecretRotation = async (req: Request, res: Response) => {
  const {
    body: {
      provider,
      customProvider,
      interval,
      outputs,
      secretPath,
      environment,
      workspaceId,
      inputs
    }
  } = await validateRequest(reqValidator.createSecretRotationV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretRotation
  );

  const secretRotation = await secretRotationService.createSecretRotation({
    workspaceId,
    inputs,
    environment,
    secretPath,
    outputs,
    interval,
    customProvider,
    provider
  });

  return res.send({ secretRotation });
};

export const restartSecretRotations = async (req: Request, res: Response) => {
  const {
    body: { id }
  } = await validateRequest(reqValidator.restartSecretRotationV1, req);

  const doc = await secretRotationService.getSecretRotationById({ id });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: doc.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.SecretRotation
  );

  const secretRotation = await secretRotationService.restartSecretRotation({ id });
  return res.send({ secretRotation });
};

export const deleteSecretRotations = async (req: Request, res: Response) => {
  const {
    params: { id }
  } = await validateRequest(reqValidator.removeSecretRotationV1, req);

  const doc = await secretRotationService.getSecretRotationById({ id });

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: doc.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.SecretRotation
  );

  const secretRotations = await secretRotationService.deleteSecretRotation({ id });
  return res.send({ secretRotations });
};

export const getSecretRotations = async (req: Request, res: Response) => {
  const {
    query: { workspaceId }
  } = await validateRequest(reqValidator.getSecretRotationV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRotation
  );

  const secretRotations = await secretRotationService.getSecretRotationOfWorkspace(workspaceId);
  return res.send({ secretRotations });
};
