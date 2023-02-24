import { Request, Response } from 'express';
import SecretApprovalRequest, { ApprovalStatus, ChangeType, IApprover, IRequestedChange } from '../../models/secretApprovalRequest';
import { Builder, IBuilder } from "builder-pattern"
import { validateSecrets } from '../../helpers/secret';
import _ from 'lodash';
import { SECRET_PERSONAL, SECRET_SHARED } from '../../variables';
import { BadRequestError, ResourceNotFound, UnauthorizedRequestError } from '../../utils/errors';
import { Membership, Secret, Workspace } from '../../models';
import { user } from '../../routes/v1';
import { BatchSecret } from '../../types/secret';
import { Types } from 'mongoose';

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

		if (!requestedChange.modifiedSecretId && (requestedChange.type != ChangeType.DELETE.toString() && requestedChange.type != ChangeType.CREATE.toString())) {
			throw BadRequestError({ message: "modifiedSecretId can only be empty when secret change type is DELETE or CREATE" })
		}

		sanitizedRequestedChangesList.push(Builder<IRequestedChange>()
			.modifiedSecretId(requestedChange.modifiedSecretId)
			.modifiedSecretDetails(requestedChange.modifiedSecretDetails)
			.approvers(approversFormatted)
			.type(requestedChange.type).build())
	});

	const newApprovalRequest = await SecretApprovalRequest.create({
		workspace: workspaceId,
		requestedByUserId: req.user._id.toString(),
		environment: environment,
		requestedChanges: sanitizedRequestedChangesList
	})

	const populatedNewApprovalRequest = await newApprovalRequest.populate(["requestedChanges.modifiedSecretId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	return res.send({ approvalRequest: populatedNewApprovalRequest });
};

export const getAllApprovalRequestsForUser = async (req: Request, res: Response) => {
	const approvalRequests = await SecretApprovalRequest.find({
		requestedByUserId: req.user._id.toString()
	}).populate(["requestedChanges.modifiedSecretId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])
		.sort({ updatedAt: -1 })

	res.send({ approvalRequests: approvalRequests })
}

export const approveApprovalRequest = async (req: Request, res: Response) => {
	const { requestedChangeIds } = req.body;
	const { reviewId } = req.params

	const approvalRequestFromDB = await SecretApprovalRequest.findById(reviewId)
	if (!approvalRequestFromDB) {
		throw ResourceNotFound()
	}

	const requestedChangesFromDB: IRequestedChange[] = approvalRequestFromDB.requestedChanges
	const requestedChangeIdsFromApproval = _.compact(_.map(requestedChangesFromDB, (change) => {
		return change._id.toString();
	}))

	const commonChangeIds = _.intersection(requestedChangeIdsFromApproval, requestedChangeIds);
	if (commonChangeIds.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "All requestedChangeIds should exist in this approval request" })
	}

	const changesThatRequireUserApproval = _.filter(requestedChangesFromDB, change => {
		return _.some(change.approvers, approver => {
			return approver.userId.toString() == req.user._id.toString();
		});
	});

	if (!changesThatRequireUserApproval.length) {
		throw UnauthorizedRequestError({ message: "Your approval is not required" })
	}

	requestedChangesFromDB.forEach((requestedChange) => {
		const overallChangeStatus = requestedChange.status
		const currentLoggedInUserId = req.user._id.toString()
		if (overallChangeStatus == ApprovalStatus.PENDING.toString()) {
			requestedChange.approvers.forEach((approver) => {
				if (approver.userId.toString() == currentLoggedInUserId && approver.status == ApprovalStatus.PENDING.toString()) {
					approver.status = ApprovalStatus.APPROVED
				}
			})

			let updateOverallStatusToApproved = true
			requestedChange.approvers.forEach((approver) => {
				if (approver.status != ApprovalStatus.APPROVED.toString()) {
					updateOverallStatusToApproved = false
				}
			})

			if (updateOverallStatusToApproved) {
				requestedChange.status = ApprovalStatus.APPROVED
			}
		}
	})

	const updatedApprovalRequest = await SecretApprovalRequest.findByIdAndUpdate(reviewId, {
		requestedChanges: requestedChangesFromDB
	}, { new: true }).populate(["requestedChanges.modifiedSecretId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	res.send({ approvalRequest: updatedApprovalRequest })
}


export const rejectApprovalRequest = async (req: Request, res: Response) => {
	const { requestedChangeIds } = req.body;
	const { reviewId } = req.params

	const approvalRequestFromDB = await SecretApprovalRequest.findById(reviewId)
	if (!approvalRequestFromDB) {
		throw ResourceNotFound()
	}

	const requestedChangesFromDB: IRequestedChange[] = approvalRequestFromDB.requestedChanges
	const requestedChangeIdsFromApproval = _.compact(_.map(requestedChangesFromDB, (change) => {
		return change._id.toString();
	}))

	const commonChangeIds = _.intersection(requestedChangeIdsFromApproval, requestedChangeIds);
	if (commonChangeIds.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "All requestedChangeIds should exist in this approval request" })
	}

	const changesThatRequireUserApproval = _.filter(requestedChangesFromDB, change => {
		return _.some(change.approvers, approver => {
			return approver.userId.toString() == req.user._id.toString();
		});
	});

	if (!changesThatRequireUserApproval.length) {
		throw UnauthorizedRequestError({ message: "Your approval is not required" })
	}

	requestedChangesFromDB.forEach((requestedChange) => {
		const overallChangeStatus = requestedChange.status
		const currentLoggedInUserId = req.user._id.toString()
		if (overallChangeStatus == ApprovalStatus.PENDING.toString()) {
			requestedChange.approvers.forEach((approver) => {
				if (approver.userId.toString() == currentLoggedInUserId && approver.status == ApprovalStatus.PENDING.toString()) {
					approver.status = ApprovalStatus.REJECTED
					requestedChange.status = ApprovalStatus.REJECTED
				}
			})
		}
	})

	const updatedApprovalRequest = await SecretApprovalRequest.findByIdAndUpdate(reviewId, {
		requestedChanges: requestedChangesFromDB
	}, { new: true }).populate(["requestedChanges.modifiedSecretId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	res.send({ approvalRequest: updatedApprovalRequest })
};

export const mergeApprovalRequestSecrets = async (req: Request, res: Response) => {
	const { requestedChangeIds } = req.body;
	const { reviewId } = req.params

	const approvalRequestFromDB = await SecretApprovalRequest.findById(reviewId)
	if (!approvalRequestFromDB) {
		throw ResourceNotFound()
	}

	const requestedChangesFromDB: IRequestedChange[] = approvalRequestFromDB.requestedChanges
	const requestedChangeIdsFromApproval = _.compact(_.map(requestedChangesFromDB, (change) => {
		return change._id.toString();
	}))

	const commonChangeIds = _.intersection(requestedChangeIdsFromApproval, requestedChangeIds);
	if (commonChangeIds.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "All requestedChangeIds should exist in this approval request" })
	}

	const changesThatRequireUserApproval = _.filter(requestedChangesFromDB, change => {
		return _.some(change.approvers, approver => {
			return approver.userId.toString() == req.user._id.toString();
		});
	});

	if (!changesThatRequireUserApproval.length) {
		throw UnauthorizedRequestError({ message: "Your approval is not required" })
	}

	const createSecrets: BatchSecret[] = [];
	const updateSecrets: BatchSecret[] = [];
	const deleteSecrets: Types.ObjectId[] = [];
	// const actions: IAction[] = [];

	requestedChangesFromDB.forEach((requestedChange) => {
		const overallChangeStatus = requestedChange.status
		const currentLoggedInUserId = req.user._id.toString()
		if (overallChangeStatus == ApprovalStatus.APPROVED.toString()) {
			switch (requestedChange.type) {
				case ChangeType.CREATE:

				case ChangeType.UPDATE:
				case ChangeType.DELETE:
			}
		} else {
			throw BadRequestError({ message: "One or more changes are not approved. Only approved changes can be merged" })
		}
	})

	const updatedApprovalRequest = await SecretApprovalRequest.findByIdAndUpdate(reviewId, {
		requestedChanges: requestedChangesFromDB
	}, { new: true }).populate(["requestedChanges.modifiedSecretId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	res.send({ approvalRequest: updatedApprovalRequest })
};
