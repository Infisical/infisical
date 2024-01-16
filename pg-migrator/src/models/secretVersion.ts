import { Schema, Types, model } from "mongoose";

export interface ISecretVersion {
  _id: Types.ObjectId;
  secret: Types.ObjectId;
  version: number;
  workspace: Types.ObjectId; // new
  type: string; // new
  user?: Types.ObjectId; // new
  environment: string; // new
  isDeleted: boolean;
  secretBlindIndex?: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  skipMultilineEncoding?: boolean;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
  createdAt: string;
  folder?: string;
  tags?: string[];
}

const secretVersionSchema = new Schema<ISecretVersion>(
  {
    secret: {
      // could be deleted
      type: Schema.Types.ObjectId,
      ref: "Secret",
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    user: {
      // user associated with the personal secret
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    environment: {
      type: String,
      required: true,
    },
    isDeleted: {
      // consider removing field
      type: Boolean,
      default: false,
      required: true,
    },
    secretBlindIndex: {
      type: String,
      
    },
    secretKeyCiphertext: {
      type: String,
      required: true,
    },
    secretKeyIV: {
      type: String, // symmetric
      required: true,
    },
    secretKeyTag: {
      type: String, // symmetric
      required: true,
    },
    secretValueCiphertext: {
      type: String,
      required: true,
    },
    secretValueIV: {
      type: String, // symmetric
      required: true,
    },
    secretValueTag: {
      type: String, // symmetric
      required: true,
    },
    skipMultilineEncoding: {
      type: Boolean,
      required: false,
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      required: true,
    },
    keyEncoding: {
      type: String,
      required: true,
    },
    folder: {
      type: String,
      required: true,
    },
    tags: {
      ref: "Tag",
      type: [Schema.Types.ObjectId],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const SecretVersion = model<ISecretVersion>(
  "SecretVersion",
  secretVersionSchema,
);
