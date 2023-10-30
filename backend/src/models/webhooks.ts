import { Document, Schema, Types, model } from "mongoose";
import { ALGORITHM_AES_256_GCM, ENCODING_SCHEME_BASE64, ENCODING_SCHEME_UTF8 } from "../variables";

export interface IWebhook extends Document {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  environment: string;
  secretPath: string;
  url: string;
  lastStatus: "success" | "failed";
  lastRunErrorMessage?: string;
  isDisabled: boolean;
  encryptedSecretKey: string;
  iv: string;
  tag: string;
  algorithm: "aes-256-gcm";
  keyEncoding: "base64" | "utf8";
}

const WebhookSchema = new Schema<IWebhook>(
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
    secretPath: {
      type: String,
      required: true,
      default: "/"
    },
    url: {
      type: String,
      required: true
    },
    lastStatus: {
      type: String,
      enum: ["success", "failed"]
    },
    lastRunErrorMessage: {
      type: String
    },
    isDisabled: {
      type: Boolean,
      default: false
    },
    // used for webhook signature
    encryptedSecretKey: {
      type: String,
      select: false
    },
    iv: {
      type: String,
      select: false
    },
    tag: {
      type: String,
      select: false
    },
    algorithm: {
      // the encryption algorithm used
      type: String,
      enum: [ALGORITHM_AES_256_GCM],
      select: false
    },
    keyEncoding: {
      type: String,
      enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
      select: false
    }
  },
  {
    timestamps: true
  }
);

export const Webhook = model<IWebhook>("Webhook", WebhookSchema);
