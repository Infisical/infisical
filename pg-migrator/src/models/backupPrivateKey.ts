import { Schema, Types, model } from "mongoose";

export interface IBackupPrivateKey {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
  salt: string;
  algorithm: string;
  keyEncoding: "base64" | "utf8";
  verifier: string;
  createdAt: string;
  updatedAt: string;
}

const backupPrivateKeySchema = new Schema<IBackupPrivateKey>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
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
    salt: {
      type: String,
      
      required: true,
    },
    verifier: {
      type: String,
      
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const BackupPrivateKey = model<IBackupPrivateKey>(
  "BackupPrivateKey",
  backupPrivateKeySchema,
);
