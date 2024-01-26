import { Schema, Types, model } from "mongoose";

export interface IAPIKeyData {
  _id: Types.ObjectId;
  name: string;
  user: Types.ObjectId;
  lastUsed: Date;
  expiresAt: Date;
  secretHash: string;
}

const apiKeyDataSchema = new Schema<IAPIKeyData>(
  {
    name: {
      type: String,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastUsed: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    secretHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const APIKeyData = model<IAPIKeyData>("APIKeyData", apiKeyDataSchema);
