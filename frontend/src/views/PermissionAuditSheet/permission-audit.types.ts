import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext";
import { TPermissionAuditSource, TPermissionAuditSourceType } from "@app/hooks/api/projects/types";

export type AuditState = "allow" | "conditional" | "forbid";

export type ActionDescriptor = {
  action: string;
  label: string;
  description?: string;
  isLegacy?: boolean;
};

export type SubjectDescriptor = {
  subject: ProjectPermissionSub;
  label: string;
  description: string;
  actions: ActionDescriptor[];
};

export type SourceRef = {
  id: string;
  type: TPermissionAuditSourceType;
  name: string;
  slug?: string;
  groupName?: string;
  isTemporary: boolean;
  temporaryAccessEndTime?: string;
};

export type AuditCondition = {
  kind: "allow" | "forbid";
  conditions: Record<string, unknown>;
};

export type ActionAudit = {
  action: string;
  label: string;
  description?: string;
  isLegacy?: boolean;
  state: AuditState;
  grantedBy: SourceRef[];
  // Sources whose unconditional inverted rules cause an explicit forbid.
  // Distinguishes "no rule grants this" (N/A, muted) from "a role forbids this" (red).
  forbiddenBy: SourceRef[];
  conditions: AuditCondition[];
};

export type ResourceAudit = {
  subject: ProjectPermissionSub;
  label: string;
  description: string;
  actions: ActionAudit[];
  allowedCount: number;
  conditionalCount: number;
  totalCount: number;
  uniqueSources: SourceRef[];
  hasAnyConditions: boolean;
};

export type ResolvedSource = SourceRef & {
  rules: {
    action: string | string[];
    subject: string | string[];
    inverted?: boolean;
    conditions?: Record<string, unknown>;
  }[];
};

export type ResolvedSourceInput = TPermissionAuditSource;
