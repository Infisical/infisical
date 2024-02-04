import { Document, Schema, Types, model } from "mongoose";
import { IIdentityTrustedIp } from "./identity";

export interface IIdentityAccessToken extends Document {
  _id: Types.ObjectId;
  identity: Types.ObjectId;
  identityUniversalAuthClientSecret?: Types.ObjectId;
  accessTokenLastUsedAt?: Date;
  accessTokenLastRenewedAt?: Date;
  accessTokenNumUses: number;
  accessTokenNumUsesLimit: number;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenTrustedIps: Array<IIdentityTrustedIp>;
  isAccessTokenRevoked: boolean;
  updatedAt: Date;
  createdAt: Date;
}

const identityAccessTokenSchema = new Schema(
  {
    identity: {
      type: Schema.Types.ObjectId,
      ref: "Identity",
      required: false,
    },
    identityUniversalAuthClientSecret: {
      type: Schema.Types.ObjectId,
      ref: "IdentityUniversalAuthClientSecret",
      required: false,
    },
    accessTokenLastUsedAt: {
      type: Date,
      required: false,
    },
    accessTokenLastRenewedAt: {
      type: Date,
      required: false,
    },
    accessTokenNumUses: {
      // number of times access token has been used
      type: Number,
      default: 0,
      required: true,
    },
    accessTokenNumUsesLimit: {
      // number of times access token can be used for
      type: Number,
      default: 0, // default: used as many times as needed
      required: true,
    },
    accessTokenTTL: {
      // seconds
      // incremental lifetime
      type: Number,
      default: 2592000, // 30 days
      required: true,
    },
    accessTokenMaxTTL: {
      // seconds
      // max lifetime
      type: Number,
      default: 2592000, // 30 days
      required: true,
    },
    accessTokenTrustedIps: {
      type: [
        {
          ipAddress: {
            type: String,
            required: true,
          },
          type: {
            type: String,
            required: true,
          },
          prefix: {
            type: Number,
            required: false,
          },
        },
      ],
      default: [],
      required: true,
    },
    isAccessTokenRevoked: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const IdentityAccessToken = model<IIdentityAccessToken>(
  "IdentityAccessToken",
  identityAccessTokenSchema,
);
