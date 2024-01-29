import { Request, Response } from "express";
import { Types } from "mongoose";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../validation/secretRotationProvider";
import * as secretRotationProviderService from "../../secretRotation/service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";

export const getProviderTemplates = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.getSecretRotationProvidersV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRotation
  );

  const rotationProviderList = await secretRotationProviderService.getProviderTemplate({
    workspaceId
  });

  return res.send(rotationProviderList);
};
