import { Schema, Types, model } from "mongoose";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
} from "../variables";
import { RiskStatus } from "../ee/models";

export interface IGitSecret {
  _id: Types.ObjectId;
  organizationId: string;
  status: RiskStatus;
  gitSecretBlindIndex?: string;
  gitSecretValueCiphertext: string;
  gitSecretValueIV: string;
  gitSecretValueTag: string;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
}

const gitSecretSchema = new Schema<IGitSecret>(
  {
    organizationId: {
      type: String,
      required: true,
    },
    gitSecretBlindIndex: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      enum: RiskStatus,
      default: RiskStatus.UNRESOLVED,
    },
    gitSecretValueCiphertext: {
      type: String,
      required: true,
      select: false,
    },
    gitSecretValueIV: {
      type: String,
      required: true,
      select: false,
    },
    gitSecretValueTag: {
      type: String,
      required: true,
      select: false,
    },
    algorithm: {
      type: String,
      enum: [ALGORITHM_AES_256_GCM],
      required: true,
      default: ALGORITHM_AES_256_GCM,
    },
    keyEncoding: {
      type: String,
      enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
      required: true,
      default: ENCODING_SCHEME_UTF8,
    },
  },
  {
    timestamps: true,
  }
);

export const GitSecret = model<IGitSecret>("GitSecret", gitSecretSchema);
