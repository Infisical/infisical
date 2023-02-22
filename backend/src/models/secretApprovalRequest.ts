import mongoose, { Schema, model } from 'mongoose';
import Secret, { ISecret, secretSchema } from './secret';

export interface IRequestedChange {
	userId: mongoose.Types.ObjectId;
	status: ApprovalStatus;
	modifiedSecret: ISecret,
	modifiedSecretId: mongoose.Types.ObjectId,
	type: string
	isApproved: boolean
}

interface ISecretApprovalRequest {
	environment: string;
	workspace: mongoose.Types.ObjectId;
	requestedChanges: IRequestedChange;
	requestedByUserId: mongoose.Types.ObjectId;
	approvers: IApprover[];
	status: ApprovalStatus;
	timestamp: Date;
	requestType: ChangeType;
	requestId: string;
}

interface IApprover {
	userId: mongoose.Types.ObjectId;
	status: ApprovalStatus;
}

export enum ApprovalStatus {
	PENDING = 'pending',
	APPROVED = 'approved',
	REJECTED = 'rejected'
}

export enum ChangeType {
	UPDATE = 'update',
	DELETE = 'delete',
	CREATE = 'create'
}

const approverSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false
	},
	status: {
		type: String,
		enum: [ApprovalStatus],
		default: ApprovalStatus.PENDING
	}
});

const secretApprovalRequestSchema = new Schema<ISecretApprovalRequest>(
	{
		environment: {
			type: String, // The secret changes were requested for 
			ref: 'Secret'
		},
		workspace: {
			type: mongoose.Schema.Types.ObjectId, // workspace id of the secret
			ref: 'Workspace'
		},
		requestedChanges: [
			{
				modifiedSecret: secretSchema,
				modifiedSecretId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'Secret'
				},
				type: {
					type: String,
					enum: ChangeType,
					required: true
				},
				isApproved: {
					type: Boolean,
					default: false,
				}
			}
		], // the changes that the requested user wants to make to the existing secret
		requestedByUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User'
		},
		approvers: [approverSchema], // the approvers who need to approve in order to merge this change 
		status: {
			type: String,
			enum: ApprovalStatus,
			default: ApprovalStatus.PENDING // the overall status of the approval 
		},
		requestId: {
			type: String,
		}
	},
	{
		timestamps: true
	}
);

const SecretApprovalRequest = model<ISecretApprovalRequest>('secret_approval_request', secretApprovalRequestSchema);

export default SecretApprovalRequest;
