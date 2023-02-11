import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import {
	Membership, Secret,
} from '../../models';
import Tag, { ITag } from '../../models/tag';
import { Builder } from "builder-pattern"
import to from 'await-to-js';
import { BadRequestError, UnauthorizedRequestError } from '../../utils/errors';
import { MongoError } from 'mongodb';
import { userHasWorkspaceAccess } from '../../ee/helpers/checkMembershipPermissions';

export const createWorkspaceTag = async (req: Request, res: Response) => {
	const { workspaceId } = req.params
	const { name, slug } = req.body
	const sanitizedTagToCreate = Builder<ITag>()
		.name(name)
		.workspace(new Types.ObjectId(workspaceId))
		.slug(slug)
		.user(new Types.ObjectId(req.user._id))
		.build();

	const [err, createdTag] = await to(Tag.create(sanitizedTagToCreate))

	if (err) {
		if ((err as MongoError).code === 11000) {
			throw BadRequestError({ message: "Tags must be unique in a workspace" })
		}

		throw err
	}

	res.json(createdTag)
}

export const deleteWorkspaceTag = async (req: Request, res: Response) => {
	const { tagId } = req.params

	const tagFromDB = await Tag.findById(tagId)
	if (!tagFromDB) {
		throw BadRequestError()
	}

	// can only delete if the request user is one that belongs to the same workspace as the tag
	const membership = await Membership.findOne({
		user: req.user,
		workspace: tagFromDB.workspace
	});

	if (!membership) {
		UnauthorizedRequestError({ message: 'Failed to validate membership' });
	}

	const result = await Tag.findByIdAndDelete(tagId);

	// remove the tag from secrets
	await Secret.updateMany(
		{ tags: { $in: [tagId] } },
		{ $pull: { tags: tagId } }
	);

	res.json(result);
}

export const getWorkspaceTags = async (req: Request, res: Response) => {
	const { workspaceId } = req.params
	const workspaceTags = await Tag.find({ workspace: workspaceId })
	return res.json({
		workspaceTags
	})
}