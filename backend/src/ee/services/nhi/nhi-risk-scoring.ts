export enum NhiRiskFactor {
  HAS_ADMIN_ACCESS = "HAS_ADMIN_ACCESS",
  CREDENTIAL_VERY_OLD = "CREDENTIAL_VERY_OLD",
  CREDENTIAL_OLD = "CREDENTIAL_OLD",
  NO_ROTATION_90_DAYS = "NO_ROTATION_90_DAYS",
  INACTIVE_BUT_ENABLED = "INACTIVE_BUT_ENABLED",
  NO_OWNER = "NO_OWNER",
  UNUSED_LONG_TERM = "UNUSED_LONG_TERM",
  DEPLOY_KEY_WRITE_ACCESS = "DEPLOY_KEY_WRITE_ACCESS",
  NO_EXPIRATION = "NO_EXPIRATION",
  OVERLY_PERMISSIVE_APP = "OVERLY_PERMISSIVE_APP"
}

export type TRiskFactor = {
  factor: NhiRiskFactor;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
};

type TRiskResult = {
  score: number;
  factors: TRiskFactor[];
};

const RISK_FACTOR_CONFIG: Record<
  NhiRiskFactor,
  { points: number; severity: TRiskFactor["severity"]; description: string }
> = {
  [NhiRiskFactor.HAS_ADMIN_ACCESS]: {
    points: 30,
    severity: "critical",
    description: "Has administrator or wildcard access"
  },
  [NhiRiskFactor.CREDENTIAL_VERY_OLD]: {
    points: 20,
    severity: "high",
    description: "Access key is older than 365 days"
  },
  [NhiRiskFactor.CREDENTIAL_OLD]: {
    points: 10,
    severity: "medium",
    description: "Access key is between 180-365 days old"
  },
  [NhiRiskFactor.NO_ROTATION_90_DAYS]: {
    points: 15,
    severity: "high",
    description: "Active key unused for over 90 days"
  },
  [NhiRiskFactor.INACTIVE_BUT_ENABLED]: {
    points: 10,
    severity: "medium",
    description: "Active key unused for over 180 days"
  },
  [NhiRiskFactor.NO_OWNER]: {
    points: 10,
    severity: "medium",
    description: "No owner assigned"
  },
  [NhiRiskFactor.UNUSED_LONG_TERM]: {
    points: 5,
    severity: "low",
    description: "No activity in 90+ days"
  },
  [NhiRiskFactor.DEPLOY_KEY_WRITE_ACCESS]: {
    points: 15,
    severity: "high",
    description: "Deploy key has write access to repository"
  },
  [NhiRiskFactor.NO_EXPIRATION]: {
    points: 10,
    severity: "medium",
    description: "Personal access token has no expiration date"
  },
  [NhiRiskFactor.OVERLY_PERMISSIVE_APP]: {
    points: 20,
    severity: "high",
    description: "App installation has write permissions on all repositories"
  }
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const daysSince = (date: Date | string | undefined | null): number => {
  if (!date) return Infinity;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
};

export type TGitHubRiskMetadata = {
  readOnly?: boolean;
  tokenExpiresAt?: string | null;
  repositorySelection?: string;
  identityType?: string;
};

type TIdentityRiskInput = {
  policies?: string[];
  keyCreateDate?: Date | string | null;
  keyLastUsedDate?: Date | string | null;
  lastActivityAt?: Date | string | null;
  ownerEmail?: string | null;
  githubMetadata?: TGitHubRiskMetadata;
};

const addFactor = (factors: TRiskFactor[], factor: NhiRiskFactor) => {
  factors.push({ ...RISK_FACTOR_CONFIG[factor], factor });
};

const checkAdminAccess = (factors: TRiskFactor[], policies: string[], githubMetadata?: TGitHubRiskMetadata) => {
  if (!policies || policies.length === 0) return;

  if (githubMetadata) {
    // GitHub: check for administration:write or members:write
    const hasGitHubAdmin = policies.some((p) => p === "administration:write" || p === "members:write");
    if (hasGitHubAdmin) {
      addFactor(factors, NhiRiskFactor.HAS_ADMIN_ACCESS);
    }
  } else {
    // AWS: check for AdministratorAccess or wildcard
    const hasAwsAdmin = policies.some((p) => p === "arn:aws:iam::aws:policy/AdministratorAccess" || p.includes(":*"));
    if (hasAwsAdmin) {
      addFactor(factors, NhiRiskFactor.HAS_ADMIN_ACCESS);
    }
  }
};

export const computeRiskScore = (input: TIdentityRiskInput): TRiskResult => {
  const factors: TRiskFactor[] = [];

  // HAS_ADMIN_ACCESS — provider-aware
  checkAdminAccess(factors, input.policies || [], input.githubMetadata);

  const keyAgeDays = daysSince(input.keyCreateDate);
  // CREDENTIAL_VERY_OLD — key >365 days
  if (keyAgeDays > 365) {
    addFactor(factors, NhiRiskFactor.CREDENTIAL_VERY_OLD);
  } else if (keyAgeDays > 180) {
    // CREDENTIAL_OLD — key 180-365 days
    addFactor(factors, NhiRiskFactor.CREDENTIAL_OLD);
  }

  const lastUsedDays = daysSince(input.keyLastUsedDate);
  // INACTIVE_BUT_ENABLED — active key unused >180 days
  if (lastUsedDays > 180) {
    addFactor(factors, NhiRiskFactor.INACTIVE_BUT_ENABLED);
  } else if (lastUsedDays > 90) {
    // NO_ROTATION_90_DAYS — active key unused >90 days
    addFactor(factors, NhiRiskFactor.NO_ROTATION_90_DAYS);
  }

  // NO_OWNER
  if (!input.ownerEmail) {
    addFactor(factors, NhiRiskFactor.NO_OWNER);
  }

  // UNUSED_LONG_TERM — no activity in 90+ days
  const activityDays = daysSince(input.lastActivityAt);
  if (activityDays > 90) {
    addFactor(factors, NhiRiskFactor.UNUSED_LONG_TERM);
  }

  // --- GitHub-specific factors ---
  if (input.githubMetadata) {
    const { readOnly, tokenExpiresAt, repositorySelection, identityType } = input.githubMetadata;

    // DEPLOY_KEY_WRITE_ACCESS — deploy key with write access
    if (identityType === "github_deploy_key" && readOnly === false) {
      addFactor(factors, NhiRiskFactor.DEPLOY_KEY_WRITE_ACCESS);
    }

    // NO_EXPIRATION — PAT with no expiration
    if (identityType === "github_finegrained_pat" && !tokenExpiresAt) {
      addFactor(factors, NhiRiskFactor.NO_EXPIRATION);
    }

    // OVERLY_PERMISSIVE_APP — app with write perms on all repos
    if (identityType === "github_app_installation" && repositorySelection === "all") {
      const hasWritePerms = (input.policies || []).some((p) => p.endsWith(":write"));
      if (hasWritePerms) {
        addFactor(factors, NhiRiskFactor.OVERLY_PERMISSIVE_APP);
      }
    }
  }

  const rawScore = factors.reduce((sum, f) => sum + RISK_FACTOR_CONFIG[f.factor].points, 0);

  return {
    score: Math.min(rawScore, 100),
    factors
  };
};

export const getRiskLevel = (score: number): "critical" | "high" | "medium" | "low" => {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  return "low";
};
