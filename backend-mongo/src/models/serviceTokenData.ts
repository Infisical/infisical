// TODO: deprecate
import { Document, Schema, Types, model } from "mongoose";

export interface IServiceTokenData extends Document {
  _id: Types.ObjectId;
  name: string;
  workspace: Types.ObjectId;
  scopes: Array<{
    environment: string;
    secretPath: string;
  }>;
  user: Types.ObjectId;
  serviceAccount: Types.ObjectId;
  lastUsed: Date;
  expiresAt: Date;
  secretHash: string;
  encryptedKey: string;
  iv: string;
  tag: string;
  permissions: string[];
}

const serviceTokenDataSchema = new Schema<IServiceTokenData>(
  {
    name: {
      type: String,
      required: true
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true
    },
    scopes: {
      type: [
        {
          environment: {
            type: String,
            required: true
          },
          secretPath: {
            type: String,
            default: "/",
            required: true
          }
        }
      ],
      required: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    serviceAccount: {
      type: Schema.Types.ObjectId,
      ref: "ServiceAccount"
    },
    lastUsed: {
      type: Date
    },
    expiresAt: {
      type: Date
    },
    secretHash: {
      type: String,
      required: true,
      select: false
    },
    encryptedKey: {
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
    permissions: {
      type: [String],
      enum: ["read", "write"],
      default: ["read"]
    }
  },
  {
    timestamps: true
  }
);

export const ServiceTokenData = model<IServiceTokenData>("ServiceTokenData", serviceTokenDataSchema);