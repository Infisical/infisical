import { Schema, model } from "mongoose";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8
} from "../../variables";
import { ISecretRotation } from "./types";

const secretRotationSchema = new Schema(
  {
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace"
    },
    provider: {
      type: String,
      required: true
    },
    customProvider: {
      type: Schema.Types.ObjectId,
      ref: "SecretRotationProvider"
    },
    environment: {
      type: String,
      required: true
    },
    secretPath: {
      type: String,
      required: true
    },
    interval: {
      type: Number,
      required: true
    },
    lastRotatedAt: {
      type: String
    },
    status: {
      type: String,
      enum: ["success", "failed"]
    },
    statusMessage: {
      type: String
    },
    // encrypted data on input keys and secrets got
    encryptedData: {
      type: String,
      select: false
    },
    encryptedDataIV: {
      type: String,
      select: false
    },
    encryptedDataTag: {
      type: String,
      select: false
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      enum: [ALGORITHM_AES_256_GCM],
      required: true,
      select: false,
      default: ALGORITHM_AES_256_GCM
    },
    keyEncoding: {
      type: String,
      enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
      required: true,
      select: false,
      default: ENCODING_SCHEME_UTF8
    },
    outputs: [
      {
        key: {
          type: String,
          required: true
        },
        secret: {
          type: Schema.Types.ObjectId,
          ref: "Secret"
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

export const SecretRotation = model<ISecretRotation>("SecretRotation", secretRotationSchema);
