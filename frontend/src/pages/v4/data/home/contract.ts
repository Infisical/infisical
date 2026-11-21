import type { ProjectType } from "@app/hooks/api/projects/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type HomeDay = { date: string; value: number };

export type HomeSecretReads = { total: number; days: HomeDay[] };

export type HomeFindings = { findings: number; dataSources: number };

export type HomeExpiringCertificates = { count: number; days: HomeDay[] };

export type HomeApprovalTarget =
  | { kind: "secret-change"; requestId: string; projectId: string }
  | { kind: "access"; requestId: string; projectSlug: string }
  | { kind: "policy"; requestId: string; policyType: string };

export type HomeApproval = {
  id: string;
  product: ProjectType;
  /** The resource the request is about, shown in the title's weight. */
  subject: string;
  /** The rest of the title, after the subject. */
  action: string;
  description: string;
  createdAt: string;
  href?: string;
  /** Break-glass and soon-expiring requests: the description reads as a warning and the row only opens a review. */
  urgent?: boolean;
  target?: HomeApprovalTarget;
};

export type HomeAttention = {
  id: string;
  product?: ProjectType;
  title: string;
  description?: string;
  createdAt: string;
  href?: string;
};

export type HomeQueue = {
  approvals: HomeApproval[];
  attention: HomeAttention[];
};

export type HomeSetup = {
  hasProject: boolean;
  hasSecrets: boolean;
  /** Null when the org can't report secret reads. */
  hasReads: boolean | null;
  members: number;
};

export type HomeAdapter = {
  /** Null when the org has no secret reads endpoint available, such as without audit log analytics. */
  useSecretReads: (orgId: string, enabled?: boolean) => V4QueryResult<HomeSecretReads | null>;
  /** Null when Secret Scanning has no data source yet. */
  useFindings: (orgId: string) => V4QueryResult<HomeFindings | null>;
  /** Null when Certificate Manager holds no certificates yet. */
  useExpiringCertificates: (orgId: string) => V4QueryResult<HomeExpiringCertificates | null>;
  useQueue: (orgId: string) => V4QueryResult<HomeQueue>;
  useApprove: V4Mutation<HomeApprovalTarget>;
  /** Pass enabled false when the checklist can't show, so its queries don't run. */
  useSetup: (orgId: string, enabled?: boolean) => V4QueryResult<HomeSetup>;
};
