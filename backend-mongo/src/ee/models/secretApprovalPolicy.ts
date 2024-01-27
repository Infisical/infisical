import { Schema, Types, model } from "mongoose";

export interface ISecretApprovalPolicy {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  name: string;
  environment: string;
  secretPath?: string;
  approvers: Types.ObjectId[];
  approvals: number;
}

const secretApprovalPolicySchema = new Schema<ISecretApprovalPolicy>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    approvers: [
      {
        // user associated with the personal secret
        type: Schema.Types.ObjectId,
        ref: "Membership"
      }
    ],
    name: {
      type: String
    },
    environment: {
      type: String,
      required: true
    },
    secretPath: {
      type: String,
      required: false
    },
    approvals: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

export const SecretApprovalPolicy = model<ISecretApprovalPolicy>(
  "SecretApprovalPolicy",
  secretApprovalPolicySchema
);
