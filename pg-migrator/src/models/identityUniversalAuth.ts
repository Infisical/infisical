import { Document, Schema, Types, model } from "mongoose";

export interface IIdentityUniversalAuth extends Document {
  _id: Types.ObjectId;
  identity: Types.ObjectId;
  clientId: string;
  clientSecretTrustedIps: Array<{}>;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: Array<{}>;
}

const identityUniversalAuthSchema = new Schema(
  {
    identity: {
      type: Schema.Types.ObjectId,
      ref: "Identity",
      required: true,
    },
    clientId: {
      type: String,
      required: true,
    },
    clientSecretTrustedIps: {
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
      default: [
        {
          ipAddress: "0.0.0.0",
          prefix: 0,
        },
      ],
      required: true,
    },
    accessTokenTTL: {
      // seconds
      // incremental lifetime
      type: Number,
      default: 7200,
      required: true,
    },
    accessTokenMaxTTL: {
      // seconds
      // max lifetime
      type: Number,
      default: 7200,
      required: true,
    },
    accessTokenNumUsesLimit: {
      // number of times access token can be used for
      type: Number,
      default: 0, // default: used as many times as needed
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
  },
  {
    timestamps: true,
  },
);

export const IdentityUniversalAuth = model<IIdentityUniversalAuth>(
  "IdentityUniversalAuth",
  identityUniversalAuthSchema,
);
