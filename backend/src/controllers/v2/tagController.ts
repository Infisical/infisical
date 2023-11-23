import { ForbiddenError } from "@casl/ability";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { Secret, Tag } from "../../models";
import { BadRequestError } from "../../utils/errors";
import { validateRequest } from "../../helpers/validation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import * as reqValidator from "../../validation/tags";

export const createWorkspaceTag = async (req: Request, res: Response) => {
  const {
    body: { name, slug },
    params: { workspaceId }
  } = await validateRequest(reqValidator.CreateWorkspaceTagsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.Tags
  );

  const tagToCreate = {
    name,
    workspace: new Types.ObjectId(workspaceId),
    slug,
    user: new Types.ObjectId(req.user._id)
  };

  const createdTag = await new Tag(tagToCreate).save();

  res.json(createdTag);
};

export const deleteWorkspaceTag = async (req: Request, res: Response) => {
  const {
    params: { tagId }
  } = await validateRequest(reqValidator.DeleteWorkspaceTagsV2, req);

  const tagFromDB = await Tag.findById(tagId);
  if (!tagFromDB) {
    throw BadRequestError();
  }

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: tagFromDB.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Tags
  );

  const result = await Tag.findByIdAndDelete(tagId);

  // remove the tag from secrets
  await Secret.updateMany({ tags: { $in: [tagId] } }, { $pull: { tags: tagId } });

  res.json(result);
};

export const getWorkspaceTags = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetWorkspaceTagsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Tags
  );

  const workspaceTags = await Tag.find({
    workspace: new Types.ObjectId(workspaceId)
  });

  return res.json({
    workspaceTags
  });
};
