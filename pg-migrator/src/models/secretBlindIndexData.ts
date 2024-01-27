import { Document, Schema, Types, model } from "mongoose";

export interface ISecretBlindIndexData extends Document {
  _id: Types.ObjectId;
  workspace: Types.ObjectId;
  encryptedSaltCiphertext: string;
  saltIV: string;
  saltTag: string;
  algorithm: "aes-256-gcm";
  keyEncoding: "base64" | "utf8";
}

const secretBlindIndexDataSchema = new Schema<ISecretBlindIndexData>({
  workspace: {
    type: Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  encryptedSaltCiphertext: {
    // TODO: make these 
    type: String,
    required: true,
  },
  saltIV: {
    type: String,
    required: true,
  },
  saltTag: {
    type: String,
    required: true,
  },
  algorithm: {
    type: String,
    required: true,
    
  },
  keyEncoding: {
    type: String,
    required: true,
    
  },
});

secretBlindIndexDataSchema.index({ workspace: 1 });

export const SecretBlindIndexData = model<ISecretBlindIndexData>(
  "SecretBlindIndexData",
  secretBlindIndexDataSchema,
);
