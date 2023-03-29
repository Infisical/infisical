import express, { Request, Response } from 'express';
const router = express.Router();
import {
	requireAuth,
	validateRequest
} from '../../middleware';
import { body, param } from 'express-validator';
import Folder from '../../models/folder';
import { BadRequestError } from '../../utils/errors';
import { Secret } from '../../models';

router.post(
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	body('workspaceId').exists(),
	body('environment').exists(),
	body('folderName').exists(),
	body('parentFolderId'),
	validateRequest,
	async (req: Request, res: Response) => {
		const { workspaceId, environment, folderName, parentFolderId } = req.body
		if (parentFolderId) {
			const parentFolder = await Folder.findById(parentFolderId);
			if (!parentFolder) {
				throw BadRequestError({ message: "The parent folder doesn't exist" })
			}
		}

		const existingFolder = await Folder.findOne({
			name: folderName,
			workspace: workspaceId,
			environment: environment,
			parent: parentFolderId,
		});

		if (existingFolder) {
			return res.json(existingFolder)
		}

		const newFolder = new Folder({
			name: folderName,
			workspace: workspaceId,
			environment: environment,
			parent: parentFolderId,
		});

		await newFolder.save();

		return res.json(newFolder)
	}
);

router.delete(
	'/:folderId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	param('folderId').exists(),
	validateRequest,
	async (req: Request, res: Response) => {
		const { folderId } = req.params
		const queue: any[] = [folderId];

		const folder = await Folder.findById(folderId);
		if (!folder) {
			throw BadRequestError({ message: "The folder doesn't exist" })
		}

		while (queue.length > 0) {
			const currentFolderId = queue.shift();

			const childFolders = await Folder.find({ parent: currentFolderId });
			for (const childFolder of childFolders) {
				queue.push(childFolder._id);
			}

			await Secret.deleteMany({ folder: currentFolderId });

			await Folder.deleteOne({ _id: currentFolderId });
		}

		res.send()
	}
);


export default router;
