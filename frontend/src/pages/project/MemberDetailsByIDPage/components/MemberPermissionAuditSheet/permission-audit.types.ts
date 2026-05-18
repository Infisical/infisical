import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext";
import { TPermissionAuditSource, TPermissionAuditSourceType } from "@app/hooks/api/projects/types";

export type AuditState = "allow" | "conditional" | "deny";

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

export type ActionAudit = {
  action: string;
  label: string;
  description?: string;
  isLegacy?: boolean;
  state: AuditState;
  grantedBy: SourceRef[];
  conditions: Record<string, unknown>[];
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
