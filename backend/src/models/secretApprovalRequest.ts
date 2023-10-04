import { Schema, Types, model } from "mongoose";
import { ISecretVersion, SecretVersion } from "../ee/models/secretVersion";

enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

enum CommitType {
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create"
}

export interface ISecretApprovalRequest {
  _id: Types.ObjectId;
  committer: Types.ObjectId;
  approvers: {
    member: Types.ObjectId;
    status: ApprovalStatus;
  }[];
  approvals: number;
  hasMerged: boolean;
  status: ApprovalStatus;
  commits: {
    secretVersion: Types.ObjectId;
    newVersion: ISecretVersion;
    op: CommitType;
  }[];
}

const secretApprovalRequestSchema = new Schema<ISecretApprovalRequest>(
  {
    approvers: [
      {
        member: {
          // user associated with the personal secret
          type: Schema.Types.ObjectId,
          ref: "Membership"
        },
        status: { type: String, enum: ApprovalStatus, default: ApprovalStatus.PENDING }
      }
    ],
    approvals: {
      type: Number,
      required: true
    },
    hasMerged: { type: Boolean, default: false },
    status: { type: String, enum: ApprovalStatus, default: ApprovalStatus.PENDING },
    committer: { type: Schema.Types.ObjectId, ref: "Membership" },
    commits: [
      {
        secretVersion: { type: Types.ObjectId, ref: "SecretVersion" },
        newVersion: SecretVersion,
        op: { type: String, enum: [CommitType], required: true }
      }
    ]
  },
  {
    timestamps: true
  }
);

export const SecretApprovalRequest = model<ISecretApprovalRequest>(
  "SecretApprovalRequest",
  secretApprovalRequestSchema
);
