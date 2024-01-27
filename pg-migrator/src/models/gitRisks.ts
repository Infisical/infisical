import { Schema, model } from "mongoose";

export const STATUS_RESOLVED_FALSE_POSITIVE = "RESOLVED_FALSE_POSITIVE";
export const STATUS_RESOLVED_REVOKED = "RESOLVED_REVOKED";
export const STATUS_RESOLVED_NOT_REVOKED = "RESOLVED_NOT_REVOKED";
export const STATUS_UNRESOLVED = "UNRESOLVED";

export type IGitRisks = {
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
  fingerPrintWithoutCommitId: string

  isFalsePositive: boolean; // New field for marking risks as false positives
  isResolved: boolean; // New field for marking risks as resolved
  riskOwner: string | null; // New field for setting a risk owner (nullable string)
  installationId: string,
  repositoryId: string,
  repositoryLink: string
  repositoryFullName: string
  status: string
  pusher: {
    name: string,
    email: string
  },
  organization: Schema.Types.ObjectId,
}

const gitRisks = new Schema<IGitRisks>({
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
  isFalsePositive: {
    type: Boolean,
    default: false
  },
  isResolved: {
    type: Boolean,
    default: false
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
    enum: [
      STATUS_RESOLVED_FALSE_POSITIVE,
      STATUS_RESOLVED_REVOKED,
      STATUS_RESOLVED_NOT_REVOKED,
      STATUS_UNRESOLVED
    ],
    default: STATUS_UNRESOLVED
  }
}, { timestamps: true });

export const GitRisks = model<IGitRisks>("GitRisks", gitRisks);