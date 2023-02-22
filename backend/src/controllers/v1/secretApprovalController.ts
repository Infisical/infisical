import { Request, Response } from 'express';
import SecretApprovalRequest, { ApprovalStatus, IRequestedChange } from '../../models/secretApprovalRequest';
import { Builder, IBuilder } from "builder-pattern"
import { validateSecrets } from '../../helpers/secret';
import _ from 'lodash';
import { SECRET_PERSONAL, SECRET_SHARED } from '../../variables';
import { BadRequestError, ResourceNotFound } from '../../utils/errors';
import { Workspace } from '../../models';

export const createApprovalRequest = async (req: Request, res: Response) => {
	const { workspaceId, environment, requestedChanges } = req.body;

	// validate workspace
	const workspaceFromDB = await Workspace.findById(workspaceId)
	if (!workspaceFromDB) {
		throw ResourceNotFound()
	}

	const environmentBelongsToWorkspace = _.some(workspaceFromDB.environments, { slug: environment })
	if (!environmentBelongsToWorkspace) {
		throw ResourceNotFound()
	}

	// check for secret duplicates 
	const hasSecretIdDuplicates = requestedChanges.length !== _.uniqBy(requestedChanges, 'modifiedSecretId').length;
	if (hasSecretIdDuplicates) {
		throw BadRequestError({ message: "Request cannot contain duplicate secrets" })
	}

	// ensure the workspace has approvers set 
	if (!workspaceFromDB.approvers.length) {
		throw BadRequestError({ message: "There are no designated approvers for this project, you must set approvers first before making a request" })
	}

	const approverIds = _.map(workspaceFromDB.approvers, "userId")

	const listOfSecretIdsToModify = _.map(requestedChanges, "modifiedSecretId")

	// ensure the secrets user is requesting to modify are the ones they have access to
	await validateSecrets({
		userId: req.user._id.toString(),
		secretIds: listOfSecretIdsToModify
	});

	const sanitizedRequestedChangesList: IRequestedChange[] = []

	requestedChanges.forEach((requestedChange: IRequestedChange) => {
		const modifiedSecret = requestedChange.modifiedSecret
		if (!modifiedSecret.type || !(modifiedSecret.type === SECRET_PERSONAL || modifiedSecret.type === SECRET_SHARED) || !modifiedSecret.secretKeyCiphertext || !modifiedSecret.secretKeyIV || !modifiedSecret.secretKeyTag || (typeof modifiedSecret.secretValueCiphertext !== 'string') || !modifiedSecret.secretValueIV || !modifiedSecret.secretValueTag) {
			throw BadRequestError({ message: "One or more required fields are missing from your modified secret" })
		}

		sanitizedRequestedChangesList.push(Builder<IRequestedChange>()
			.modifiedSecretId(requestedChange.modifiedSecretId)
			.modifiedSecret(requestedChange.modifiedSecret)
			.type(requestedChange.type).build())

	});

	const filter = {
		workspace: workspaceId,
		requestedByUserId: req.user._id.toString(),
		environment: environment,
		status: ApprovalStatus.PENDING.toString()
	};

	const update = {
		requestedChanges: sanitizedRequestedChangesList,
		approvers: approverIds
	};

	const options = {
		new: true,
		upsert: true
	};

	const request = await SecretApprovalRequest.findOneAndUpdate(filter, update, options)

	return res.status(200).send(request);
};

export const cancelApprovalRequest = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};

export const updateApprovalRequest = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};

export const addApproverToApprovalRequest = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};

export const removeApproverFromApprovalRequest = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};