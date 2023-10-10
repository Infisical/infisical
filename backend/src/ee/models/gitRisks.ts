import { Schema, model } from "mongoose";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_BASE64,
  ENCODING_SCHEME_UTF8,
} from "../../variables";

export enum RiskStatus {
  RESOLVED_FALSE_POSITIVE = "RESOLVED_FALSE_POSITIVE",
  RESOLVED_REVOKED = "RESOLVED_REVOKED",
  RESOLVED_NOT_REVOKED = "RESOLVED_NOT_REVOKED",
  UNRESOLVED = "UNRESOLVED",
}

export interface GitRisksEncryptionProperties {
  gitSecretValueCiphertext: string;
  gitSecretValueIV: string;
  gitSecretValueTag: string;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
}

export type GitRisks = {
  id: string;
  description: string;
  startLine: string;
  endLine: string;
  startColumn: string;
  endColumn: string;
  match: string;
  secret: string;
  file: string;
  symlinkFile: string;
  commit: string;
  entropy: string;
  author: string;
  email: string;
  date: string;
  message: string;
  tags: string[];
  ruleID: string;
  fingerprint: string;
  fingerPrintWithoutCommitId: string;
  riskOwner: string | null; // New field for setting a risk owner (nullable string)
  installationId: string;
  repositoryId: string;
  repositoryLink: string;
  repositoryFullName: string;
  status: RiskStatus;
  pusher: {
    name: string;
    email: string;
  };
  organization: Schema.Types.ObjectId,
  gitSecretBlindIndex?: string;
} & GitRisksEncryptionProperties;

const gitRisks = new Schema<GitRisks>({
  id: {
    type: String,
  },
  description: {
    type: String,
  },
  startLine: {
    type: String,
  },
  endLine: {
    type: String,
  },
  startColumn: {
    type: String,
  },
  endColumn: {
    type: String,
  },
  file: {
    type: String,
  },
  symlinkFile: {
    type: String,
  },
  commit: {
    type: String,
  },
  entropy: {
    type: String,
  },
  author: {
    type: String,
  },
  email: {
    type: String,
  },
  date: {
    type: String,
  },
  message: {
    type: String,
  },
  tags: {
    type: [String],
  },
  ruleID: {
    type: String,
  },
  fingerprint: {
    type: String,
    unique: true
  },
  fingerPrintWithoutCommitId: {
    type: String,
  },
  riskOwner: {
    type: String,
    default: null
  },
  installationId: {
    type: String,
    require: true
  },
  repositoryId: {
    type: String
  },
  repositoryLink: {
    type: String
  },
  repositoryFullName: {
    type: String
  },
  pusher: {
    name: {
      type: String
    },
    email: {
      type: String
    },
  },
  organization: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
  },
  status: {
    type: String,
    enum: RiskStatus,
    default: RiskStatus.UNRESOLVED,
  },
  gitSecretBlindIndex: {
    type: String,
    select: false,
  },
  gitSecretValueCiphertext: {
    type: String,
    select: false,
  },
  gitSecretValueIV: {
    type: String,
    select: false,
  },
  gitSecretValueTag: {
    type: String,
    select: false,
  },
  algorithm: {
    type: String,
    enum: [ALGORITHM_AES_256_GCM],
    default: ALGORITHM_AES_256_GCM,
  },
  keyEncoding: {
    type: String,
    enum: [ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64],
    default: ENCODING_SCHEME_UTF8,
  },
}, { timestamps: true });

export const GitRisks = model<GitRisks>("GitRisks", gitRisks);