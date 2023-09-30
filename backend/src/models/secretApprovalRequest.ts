import { Schema, Types, model } from "mongoose";
import { ALGORITHM_AES_256_GCM, ENCODING_SCHEME_BASE64, ENCODING_SCHEME_UTF8 } from "../variables";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export enum CommitType {
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create"
}

export interface ISecretApprovalSecChange {
  _id: Types.ObjectId;
  version: number;
  secretBlindIndex?: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  secretCommentCiphertext?: string;
  skipMultilineEncoding?: boolean;
  algorithm?: "aes-256-gcm";
  keyEncoding?: "utf8" | "base64";
  tags?: string[];
}

export interface ISecretApprovalRequest {
  _id: Types.ObjectId;
  committer: Types.ObjectId;
  reviewers: {
    member: Types.ObjectId;
    status: ApprovalStatus;
  }[];
  workspace: Types.ObjectId;
  environment: string;
  folderId: string;
  hasMerged: boolean;
  status: "open" | "close";
  policy: Types.ObjectId;
  commits: Array<
    | {
        newVersion: ISecretApprovalSecChange;
        op: CommitType.CREATE;
      }
    | {
        secret: Types.ObjectId;
        newVersion: Partial<ISecretApprovalSecChange>;
        op: CommitType.UPDATE;
      }
    | {
        secret: Types.ObjectId;
        op: CommitType.DELETE;
      }
  >;
}

const secretApprovalSecretChangeSchema = new Schema<ISecretApprovalSecChange>({
  version: {
    type: Number,
    default: 1,
    required: true
  },
  secretBlindIndex: {
    type: String,
    select: false
  },
  secretKeyCiphertext: {
    type: String,
    required: true
  },
  secretKeyIV: {
    type: String, // symmetric
    required: true
  },
  secretKeyTag: {
    type: String, // symmetric
    required: true
  },
  secretValueCiphertext: {
    type: String,
    required: true
  },
  secretValueIV: {
    type: String, // symmetric
    required: true
  },
  secretValueTag: {
    type: String, // symmetric
    required: true
  },
  skipMultilineEncoding: {
    type: Boolean,
    required: false
  },
  algorithm: {
    // the encryption algorithm used
    type: String,
    enum: [ALGORITHM_AES_256_GCM],
    required: true,
    default: ALGORITHM_AES_256_GCM
  },
  keyEncoding: {
    type: String,
    enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
    required: true,
    default: ENCODING_SCHEME_UTF8
  },
  tags: {
    ref: "Tag",
    type: [Schema.Types.ObjectId],
    default: []
  }
});

const secretApprovalRequestSchema = new Schema<ISecretApprovalRequest>(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    environment: {
      type: String,
      required: true
    },
    folderId: {
      type: String,
      required: true,
      default: "root"
    },
    reviewers: {
      type: [
        {
          member: {
            // user associated with the personal secret
            type: Schema.Types.ObjectId,
            ref: "Membership"
          },
          status: { type: String, enum: ApprovalStatus, default: ApprovalStatus.PENDING }
        }
      ],
      default: []
    },
    policy: { type: Schema.Types.ObjectId, ref: "SecretApprovalPolicy" },
    hasMerged: { type: Boolean, default: false },
    status: { type: String, enum: ["close", "open"], default: "open" },
    committer: { type: Schema.Types.ObjectId, ref: "Membership" },
    commits: [
      {
        secret: { type: Types.ObjectId, ref: "Secret" },
        newVersion: secretApprovalSecretChangeSchema,
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
