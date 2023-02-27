import { Request, Response } from 'express';
import SecretApprovalRequest, { ApprovalStatus, ChangeType, IApprover, IRequestedChange } from '../../models/secretApprovalRequest';
import { Builder, IBuilder } from "builder-pattern"
import { secretObjectHasRequiredFields, validateSecrets } from '../../helpers/secret';
import _ from 'lodash';
import { SECRET_PERSONAL, SECRET_SHARED } from '../../variables';
import { BadRequestError, ResourceNotFound, UnauthorizedRequestError } from '../../utils/errors';
import { ISecret, Membership, Secret, Workspace } from '../../models';
import mongoose from 'mongoose';

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
	const hasSecretIdDuplicates = requestedChanges.length !== _.uniqBy(requestedChanges, 'modifiedSecretParentId').length;
	if (hasSecretIdDuplicates) {
		throw BadRequestError({ message: "Request cannot contain changes for duplicate secrets" })
	}

	// ensure the workspace has approvers set 
	if (!workspaceFromDB.approvers.length) {
		throw BadRequestError({ message: "There are no designated approvers for this project, you must set approvers first before making a request" })
	}

	const approverIds = _.compact(_.map(workspaceFromDB.approvers, "userId"))
	const approversFormatted: IApprover[] = approverIds.map(id => {
		return { "userId": id, status: ApprovalStatus.PENDING }
	})

	const listOfSecretIdsToModify = _.compact(_.map(requestedChanges, "modifiedSecretParentId"))

	// Ensure that the user requesting changes for the set of secrets can indeed interact with said secrets
	if (listOfSecretIdsToModify.length > 0) {
		await validateSecrets({
			userId: req.user._id.toString(),
			secretIds: listOfSecretIdsToModify
		});
	}

	const sanitizedRequestedChangesList: IRequestedChange[] = []
	requestedChanges.forEach((requestedChange: IRequestedChange) => {
		const secretDetailsIsValid = secretObjectHasRequiredFields(requestedChange.modifiedSecretDetails)
		if (!secretDetailsIsValid) {
			throw BadRequestError({ message: "One or more required fields are missing from your modified secret" })
		}

		if (!requestedChange.modifiedSecretParentId && (requestedChange.type != ChangeType.DELETE.toString() && requestedChange.type != ChangeType.CREATE.toString())) {
			throw BadRequestError({ message: "modifiedSecretParentId can only be empty when secret change type is DELETE or CREATE" })
		}

		sanitizedRequestedChangesList.push(Builder<IRequestedChange>()
			.modifiedSecretParentId(requestedChange.modifiedSecretParentId)
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

	const populatedNewApprovalRequest = await newApprovalRequest.populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	return res.send({ approvalRequest: populatedNewApprovalRequest });
};

export const getAllApprovalRequestsForUser = async (req: Request, res: Response) => {
	const approvalRequests = await SecretApprovalRequest.find({
		requestedByUserId: req.user._id.toString()
	}).populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])
		.sort({ updatedAt: -1 })

	res.send({ approvalRequests: approvalRequests })
}

export const getAllApprovalRequestsThatRequireUserApproval = async (req: Request, res: Response) => {
	const approvalRequests = await SecretApprovalRequest.find({
		'requestedChanges.approvers.userId': req.user._id.toString()
	}).populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])
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
	const filteredChangesByIds = requestedChangesFromDB.filter(change => requestedChangeIds.includes(change._id.toString()))
	if (filteredChangesByIds.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "All requestedChangeIds should exist in this approval request" })
	}

	const changesThatRequireUserApproval = _.filter(filteredChangesByIds, change => {
		return _.some(change.approvers, approver => {
			return approver.userId.toString() == req.user._id.toString();
		});
	});

	if (!changesThatRequireUserApproval.length) {
		throw UnauthorizedRequestError({ message: "Your approval is not required for this review" })
	}

	if (changesThatRequireUserApproval.length != filteredChangesByIds.length) {
		throw BadRequestError({ message: "You may only request to approve changes that require your approval" })
	}

	changesThatRequireUserApproval.forEach((requestedChange) => {
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
	}, { new: true }).populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

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
	const filteredChangesByIds = requestedChangesFromDB.filter(change => requestedChangeIds.includes(change._id.toString()))
	if (filteredChangesByIds.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "All requestedChangeIds should exist in this approval request" })
	}

	const changesThatRequireUserApproval = _.filter(filteredChangesByIds, change => {
		return _.some(change.approvers, approver => {
			return approver.userId.toString() == req.user._id.toString();
		});
	});

	if (!changesThatRequireUserApproval.length) {
		throw UnauthorizedRequestError({ message: "Your approval is not required for this review" })
	}

	if (changesThatRequireUserApproval.length != filteredChangesByIds.length) {
		throw BadRequestError({ message: "You may only request to reject changes that require your approval" })
	}

	changesThatRequireUserApproval.forEach((requestedChange) => {
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
	}, { new: true }).populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

	res.send({ approvalRequest: updatedApprovalRequest })
};

export const mergeApprovalRequestSecrets = async (req: Request, res: Response) => {
	const { requestedChangeIds } = req.body;
	const { reviewId } = req.params

	// only the user who requested the set of changes can merge it
	const approvalRequestFromDB = await SecretApprovalRequest.findOne({ _id: reviewId, requestedByUserId: req.user._id })
	if (!approvalRequestFromDB) {
		throw ResourceNotFound()
	}

	// ensure that this user is a member of this workspace
	const membershipDetails = await Membership.find({ user: req.user._id, workspace: approvalRequestFromDB.workspace })
	if (!membershipDetails) {
		throw UnauthorizedRequestError()
	}

	// filter not merged, approved, and change ids specified in this request
	const filteredChangesToMerge: IRequestedChange[] = approvalRequestFromDB.requestedChanges.filter(change => change.merged == false && change.status == ApprovalStatus.APPROVED && requestedChangeIds.includes(change._id.toString()))

	if (filteredChangesToMerge.length != requestedChangeIds.length) {
		throw BadRequestError({ message: "One or more changes in this approval is either already merged/not approved or do not exist" })
	}

	const secretsToCreate: ISecret[] = []
	const secretsToUpdate: any[] = []
	const secretsIdsToDelete: any[] = []
	const secretIdsToModify: any[] = []

	filteredChangesToMerge.forEach((requestedChange: any) => {
		const overallChangeStatus = requestedChange.status
		const currentLoggedInUserId = req.user._id.toString()
		if (overallChangeStatus == ApprovalStatus.APPROVED.toString()) {
			if (ChangeType.CREATE.toString() == requestedChange.type) {
				const modifiedSecret = requestedChange.modifiedSecretDetails.toObject()

				secretsToCreate.push({
					...modifiedSecret,
					user: requestedChange.modifiedSecretDetails.type === SECRET_PERSONAL ? currentLoggedInUserId : undefined,
				})
			}

			if (ChangeType.UPDATE.toString() == requestedChange.type) {
				const modifiedSecret = requestedChange.modifiedSecretDetails.toObject()
				secretIdsToModify.push(requestedChange.modifiedSecretParentId)

				secretsToUpdate.push({
					filter: { _id: requestedChange.modifiedSecretParentId },
					update: {
						$set: {
							...modifiedSecret,
							user: requestedChange.modifiedSecretDetails.type === SECRET_PERSONAL ? currentLoggedInUserId : undefined,
						},
						$inc: {
							version: 1
						}
					}
				})

			}

			if (ChangeType.DELETE.toString() == requestedChange.type) {
				secretsIdsToDelete.push({
					_id: requestedChange.modifiedSecretParentId.toString()
				})
			}

			requestedChange.merged = true
		}
	})

	// ensure all secrets that are to be updated exist 
	const numSecretsFromDBThatRequireUpdate = await Secret.countDocuments({ _id: { $in: secretIdsToModify } });
	const numSecretsFromDBThatRequireDelete = await Secret.countDocuments({ _id: { $in: secretsIdsToDelete } });

	if (numSecretsFromDBThatRequireUpdate != secretIdsToModify.length || numSecretsFromDBThatRequireDelete != secretsIdsToDelete.length) {
		throw BadRequestError({ message: "You cannot merge changes for secrets that no longer exist" })
	}

	// Add add CRUD operations into a single list of operations
	const allOperationsForBulkWrite: any[] = [];

	for (const updateStatement of secretsToUpdate) {
		allOperationsForBulkWrite.push({ updateOne: updateStatement });
	}

	for (const secretId of secretsIdsToDelete) {
		allOperationsForBulkWrite.push({ deleteOne: { filter: { _id: secretId } } });
	}

	for (const createStatement of secretsToCreate) {
		allOperationsForBulkWrite.push({ insertOne: { document: createStatement } });
	}

	// start transaction 
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		await Secret.bulkWrite(allOperationsForBulkWrite);
		await SecretApprovalRequest.updateOne({ _id: reviewId, 'requestedChanges._id': { $in: requestedChangeIds } },
			{ $set: { 'requestedChanges.$.merged': true } })

		const updatedApproval = await SecretApprovalRequest.findById(reviewId).populate(["requestedChanges.modifiedSecretParentId", { path: 'requestedChanges.approvers.userId', select: 'firstName lastName _id' }])

		res.send(updatedApproval)
	} catch (error) {
		await session.abortTransaction();
		throw error
	} finally {
		session.endSession();
	}

};
