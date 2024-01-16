import { Schema, Types, model } from "mongoose";

export interface IBot {
  _id: Types.ObjectId;
  name: string;
  workspace: Types.ObjectId;
  isActive: boolean;
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  algorithm: "aes-256-gcm";
  keyEncoding: "base64" | "utf8";
}

const botSchema = new Schema<IBot>(
  {
    name: {
      type: String,
      required: true,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: false,
    },
    publicKey: {
      type: String,
      required: true,
    },
    encryptedPrivateKey: {
      type: String,
      required: true,
      
    },
    iv: {
      type: String,
      required: true,
      
    },
    tag: {
      type: String,
      required: true,
      
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
  },
  {
    timestamps: true,
  },
);

export const Bot = model<IBot>("Bot", botSchema);
