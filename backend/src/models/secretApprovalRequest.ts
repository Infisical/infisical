import mongoose, { Schema, model } from "mongoose";
import { ISecret, Secret } from "./secret";

interface ISecretApprovalRequest {
	secret: mongoose.Types.ObjectId;
	requestedChanges: ISecret;
	requestedBy: mongoose.Types.ObjectId;
	approvers: IApprover[];
	status: ApprovalStatus;
	timestamp: Date;
	requestType: RequestType;
	requestId: string;
}

interface IApprover {
	userId: mongoose.Types.ObjectId;
	status: ApprovalStatus;
}

export enum ApprovalStatus {
	PENDING = "pending",
	APPROVED = "approved",
	REJECTED = "rejected"
}

export enum RequestType {
	UPDATE = "update",
	DELETE = "delete",
	CREATE = "create"
}

const approverSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	status: {
		type: String,
		enum: [ApprovalStatus],
		default: ApprovalStatus.PENDING,
	},
});

const secretApprovalRequestSchema = new Schema<ISecretApprovalRequest>(
	{
		secret: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Secret",
		},
		requestedChanges: Secret,
		requestedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		approvers: [approverSchema],
		status: {
			type: String,
			enum: ApprovalStatus,
			default: ApprovalStatus.PENDING,
		},
		timestamp: {
			type: Date,
			default: Date.now,
		},
		requestType: {
			type: String,
			enum: RequestType,
			required: true,
		},
		requestId: {
			type: String,
			required: false,
		},
	},
	{
		timestamps: true,
	}
);

export const SecretApprovalRequest = model<ISecretApprovalRequest>("SecretApprovalRequest", secretApprovalRequestSchema);