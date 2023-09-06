export enum RiskStatus {
  RESOLVED_FALSE_POSITIVE = "RESOLVED_FALSE_POSITIVE",
  RESOLVED_REVOKED = "RESOLVED_REVOKED",
  RESOLVED_NOT_REVOKED = "RESOLVED_NOT_REVOKED",
  UNRESOLVED = "UNRESOLVED",
}

export type GitRisks = {
  _id: string;
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
  status: RiskStatus;
  riskOwner: string | null; // New field for setting a risk owner (nullable string)
  installationId: string,
  repositoryId: string,
  repositoryLink: string
  repositoryFullName: string
  pusher: {
    name: string,
    email: string
  },
  createdAt: string,
  organization: string,
}