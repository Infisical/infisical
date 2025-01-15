export enum RiskStatus {
  RESOLVED_FALSE_POSITIVE = "RESOLVED_FALSE_POSITIVE",
  RESOLVED_REVOKED = "RESOLVED_REVOKED",
  RESOLVED_NOT_REVOKED = "RESOLVED_NOT_REVOKED",
  UNRESOLVED = "UNRESOLVED"
}

export enum SecretScanningOrderBy {
  CreatedAt = "createdAt"
}

export enum SecretScanningResolvedStatus {
  All = "all",
  Resolved = "resolved",
  Unresolved = "unresolved"
}

export type SecretScanningRiskFilter = {
  repositoryNames?: string[];
  resolvedStatus?: SecretScanningResolvedStatus;
};

export type TSecretScanningGitRisks = {
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
  status: string;
  isFalsePositive: boolean; // New field for marking risks as false positives
  isResolved: boolean; // New field for marking risks as resolved
  riskOwner: string | null; // New field for setting a risk owner (nullable string)
  installationId: string;
  repositoryId: string;
  repositoryLink: string;
  repositoryFullName: string;
  pusher: {
    name: string;
    email: string;
  };
  createdAt: string;
  orgId: string;
};

export type TGitAppOrg = {
  id: string;
  installationId: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
};
