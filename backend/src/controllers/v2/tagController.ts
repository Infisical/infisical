import { Request, Response } from "express";
import { Types } from "mongoose";
import { Membership, Secret } from "../../models";
import Tag from "../../models/tag";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";

export const createWorkspaceTag = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const { name, slug, tagColor } = req.body;
  
  const tagToCreate = {
      name,
      tagColor,
      workspace: new Types.ObjectId(workspaceId),
      slug,
      user: new Types.ObjectId(req.user._id),
    };
  
  const createdTag = await new Tag(tagToCreate).save();
  
  res.json(createdTag);
};

export const deleteWorkspaceTag = async (req: Request, res: Response) => {
  const { tagId } = req.params;

  const tagFromDB = await Tag.findById(tagId);
  if (!tagFromDB) {
    throw BadRequestError();
  }

  // can only delete if the request user is one that belongs to the same workspace as the tag
  const membership = await Membership.findOne({
    user: req.user,
    workspace: tagFromDB.workspace
  });

  if (!membership) {
    UnauthorizedRequestError({ message: "Failed to validate membership" });
  }

  const result = await Tag.findByIdAndDelete(tagId);

  // remove the tag from secrets
  await Secret.updateMany({ tags: { $in: [tagId] } }, { $pull: { tags: tagId } });

  res.json(result);
};

export const getWorkspaceTags = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  
  const workspaceTags = await Tag.find({ 
    workspace: new Types.ObjectId(workspaceId) 
  });
  
  return res.json({
    workspaceTags
  });
};
