import { Schema, Types, model } from "mongoose";

export interface IBotOrg {
  _id: Types.ObjectId;
  name: string;
  organization: Types.ObjectId;
  publicKey: string;
  encryptedSymmetricKey: string;
  symmetricKeyIV: string;
  symmetricKeyTag: string;
  symmetricKeyAlgorithm: "aes-256-gcm";
  symmetricKeyKeyEncoding: "base64" | "utf8";
  encryptedPrivateKey: string;
  privateKeyIV: string;
  privateKeyTag: string;
  privateKeyAlgorithm: "aes-256-gcm";
  privateKeyKeyEncoding: "base64" | "utf8";
}

const botOrgSchema = new Schema<IBotOrg>(
  {
    name: {
      type: String,
      required: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    publicKey: {
      type: String,
      required: true,
    },
    encryptedSymmetricKey: {
      type: String,
      required: true,
    },
    symmetricKeyIV: {
      type: String,
      required: true,
    },
    symmetricKeyTag: {
      type: String,
      required: true,
    },
    symmetricKeyAlgorithm: {
      type: String,
      required: true,
    },
    symmetricKeyKeyEncoding: {
      type: String,
      required: true,
    },
    encryptedPrivateKey: {
      type: String,
      required: true,
    },
    privateKeyIV: {
      type: String,
      required: true,
    },
    privateKeyTag: {
      type: String,
      required: true,
    },
    privateKeyAlgorithm: {
      type: String,
      required: true,
    },
    privateKeyKeyEncoding: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export const BotOrg = model<IBotOrg>("BotOrg", botOrgSchema);
