import { Document, Schema, model, Types } from "mongoose";

export interface ISecretRotation extends Document {
  _id: Types.ObjectId;
  name: string;
  interval: number;
  provider: string;
  customProvider: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  secretPath: string;
  outputs: Array<{
    key: string;
    secret: Types.ObjectId;
  }>;
  status?: "success" | "failed";
  lastRotatedAt?: string;
  statusMessage?: string;
  encryptedData: string;
  encryptedDataIV: string;
  encryptedDataTag: string;
  algorithm: string;
  keyEncoding: string;
}
const secretRotationSchema = new Schema(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
    },
    provider: {
      type: String,
      required: true,
    },
    customProvider: {
      type: Schema.Types.ObjectId,
      ref: "SecretRotationProvider",
    },
    environment: {
      type: String,
      required: true,
    },
    secretPath: {
      type: String,
      required: true,
    },
    interval: {
      type: Number,
      required: true,
    },
    lastRotatedAt: {
      type: String,
    },
    status: {
      type: String,
      enum: ["success", "failed"],
    },
    statusMessage: {
      type: String,
    },
    // encrypted data on input keys and secrets got
    encryptedData: {
      type: String,
      select: false,
    },
    encryptedDataIV: {
      type: String,
      select: false,
    },
    encryptedDataTag: {
      type: String,
      select: false,
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      required: true,
      select: false,
    },
    keyEncoding: {
      type: String,
      required: true,
      select: false,
    },
    outputs: [
      {
        key: {
          type: String,
          required: true,
        },
        secret: {
          type: Schema.Types.ObjectId,
          ref: "Secret",
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export const SecretRotation = model<ISecretRotation>(
  "SecretRotation",
  secretRotationSchema,
);
