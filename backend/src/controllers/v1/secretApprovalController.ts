import { Request, Response } from 'express';
import SecretApprovalRequest, { ApprovalStatus, ChangeType, IApprover, IRequestedChange } from '../../models/secretApprovalRequest';
import { Builder, IBuilder } from "builder-pattern"
import { validateSecrets } from '../../helpers/secret';
import _ from 'lodash';
import { SECRET_PERSONAL, SECRET_SHARED } from '../../variables';
import { BadRequestError, ResourceNotFound, UnauthorizedRequestError } from '../../utils/errors';
import { Membership, Secret, Workspace } from '../../models';
import { user } from '../../routes/v1';

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

	const approverIds = _.compact(_.map(workspaceFromDB.approvers, "userId"))
	const approversFormatted: IApprover[] = approverIds.map(id => {
		return { "userId": id, status: ApprovalStatus.PENDING }
	})

	const listOfSecretIdsToModify = _.compact(_.map(requestedChanges, "modifiedSecretId"))

	if (listOfSecretIdsToModify.length > 0) {
		await validateSecrets({
			userId: req.user._id.toString(),
			secretIds: listOfSecretIdsToModify
		});
	}

	const sanitizedRequestedChangesList: IRequestedChange[] = []
	requestedChanges.forEach((requestedChange: IRequestedChange) => {
		const modifiedSecret = requestedChange.modifiedSecretDetails
		if (!modifiedSecret.type || !(modifiedSecret.type === SECRET_PERSONAL || modifiedSecret.type === SECRET_SHARED) || !modifiedSecret.secretKeyCiphertext || !modifiedSecret.secretKeyIV || !modifiedSecret.secretKeyTag || (typeof modifiedSecret.secretValueCiphertext !== 'string') || !modifiedSecret.secretValueIV || !modifiedSecret.secretValueTag) {
			throw BadRequestError({ message: "One or more required fields are missing from your modified secret" })
		}

		if (!requestedChange.modifiedSecretId && (requestedChange.type != ChangeType.DELETE.toString() || requestedChange.type != ChangeType.CREATE.toString())) {
			throw BadRequestError({ message: "modifiedSecretId can only be empty when secret change type is DELETE or CREATE" })
		}

		sanitizedRequestedChangesList.push(Builder<IRequestedChange>()
			.modifiedSecretId(requestedChange.modifiedSecretId)
			.modifiedSecretDetails(requestedChange.modifiedSecretDetails)
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
		approvers: approversFormatted
	};

	const options = {
		new: true,
		upsert: true
	};

	const request = await SecretApprovalRequest
		.findOneAndUpdate(filter, update, options)
		.populate(["requestedChanges.modifiedSecretId", { path: 'approvers.userId', select: 'firstName lastName _id' }])

	return res.status(200).send({ request });
};

export const getAllApprovalRequestsForUser = async (req: Request, res: Response) => {
	const approvalRequests = await SecretApprovalRequest.find({
		requestedByUserId: req.user._id.toString()
	}).populate(["requestedChanges.modifiedSecretId", { path: 'approvers.userId', select: 'firstName lastName _id' }])
		.sort({ updatedAt: -1 })

	res.send(approvalRequests)
}

export const approveChanges = async (req: Request, res: Response) => {
	const { requestedChangeIds } = req.body;
	const { reviewId } = req.query

	const approvalRequestFromDB = await SecretApprovalRequest.findById(reviewId)
	if (!approvalRequestFromDB) {
		throw ResourceNotFound()
	}

	const requestedChangeIdsFromApproval = _.compact(_.map(approvalRequestFromDB.requestedChanges, "_id"))
	const requestedChangeIdDifferences = _.difference(requestedChangeIds, requestedChangeIdsFromApproval);

	// ensure that all requested change ids belong to this approval request 
	if (requestedChangeIdDifferences.length != 0) {
		const err = `Invalid changes requested for approval [requestedChangeIdDifferences=${requestedChangeIdDifferences}]`
		throw BadRequestError({ message: err })
	}

	// ensure that the current user is member of workspace 
	const relatedApprovalRequestWorkspace = await Membership.find({
		workspace: approvalRequestFromDB.workspace,
		user: req.user._id.toString()
	})

	if (!relatedApprovalRequestWorkspace) {
		throw UnauthorizedRequestError({ message: "Only project members can modify approval requests" })
	}





}


export const cancelApprovalRequest = async (req: Request, res: Response) => {
	return res.status(200).send({
		user: req.user
	});
};

