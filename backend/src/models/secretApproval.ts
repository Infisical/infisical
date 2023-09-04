import { Schema, Types, model } from "mongoose";

export interface ISecretApproval {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  secretPath?: string;
  approvers: Types.ObjectId[];
  approvals: number;
}

const secretApprovalSchema = new Schema<ISecretApproval>(
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

export const SecretApproval = model<ISecretApproval>("SecretApproval", secretApprovalSchema);
