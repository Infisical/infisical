import mongoose, { Schema, model } from 'mongoose';
import Secret, { ISecret, secretSchema } from './secret';

export interface IRequestedChange {
	_id: string
	userId: mongoose.Types.ObjectId;
	status: ApprovalStatus;
	modifiedSecretDetails: ISecret,
	modifiedSecretId: mongoose.Types.ObjectId,
	type: string,
	approvers: IApprover[]
}

interface ISecretApprovalRequest {
	environment: string;
	workspace: mongoose.Types.ObjectId;
	requestedChanges: IRequestedChange[];
	requestedByUserId: mongoose.Types.ObjectId;
	timestamp: Date;
	requestType: ChangeType;
	requestId: string;
}

export interface IApprover {
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
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: false,
	},
	status: {
		type: String,
		enum: [ApprovalStatus],
		default: ApprovalStatus.PENDING
	}
}, { timestamps: true });

const requestedChangeSchema = new mongoose.Schema(
	{
		_id: { type: mongoose.Schema.Types.ObjectId, auto: true },
		modifiedSecretDetails: secretSchema,
		modifiedSecretId: { // used to fetch the current version of this secret for comparing 
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Secret'
		},
		type: {
			type: String,
			enum: ChangeType,
			required: true
		},
		status: {
			type: String,
			enum: ApprovalStatus,
			default: ApprovalStatus.PENDING // the overall status of the requested change
		},
		approvers: [approverSchema],
		merged: {
			type: Boolean,
			default: false,
		}
	},
	{ timestamps: true }
);

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
		requestedChanges: [requestedChangeSchema], // the changes that the requested user wants to make to the existing secret
		requestedByUserId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User'
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
