export enum InfraRunStatus {
  Pending = "pending",
  Running = "running",
  Success = "success",
  Failed = "failed",
  AwaitingApproval = "awaiting_approval",
  Denied = "denied"
}

export enum InfraRunType {
  Plan = "plan",
  Apply = "apply",
  Destroy = "destroy"
}

export type TCreateFileDTO = {
  projectId: string;
  name: string;
  content: string;
};

export type TDeleteFileDTO = {
  projectId: string;
  name: string;
};

export type TTriggerRunDTO = {
  projectId: string;
  mode: "plan" | "apply" | "destroy";
  userId?: string;
  approved?: boolean; // true when re-triggering after approval (skip approval gate)
};

export type TListRunsDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
};

export type TUpsertVariableDTO = {
  projectId: string;
  key: string;
  value: string;
  sensitive?: boolean;
};

export type TDeleteVariableDTO = {
  projectId: string;
  key: string;
};

// Structured AI insight response
export type TAiInsight = {
  summary: string;
  costs: {
    estimated: Array<{ resource: string; monthlyCost: string; source: string }>;
    aiEstimated: Array<{ resource: string; monthlyCost: string; confidence: "high" | "medium" | "low" }>;
    totalMonthly: string;
    deltaMonthly: string;
  };
  security: {
    issues: Array<{
      severity: "critical" | "high" | "medium" | "low";
      resource: string;
      description: string;
      recommendation: string;
    }>;
    shouldApprove: boolean;
  };
};

// Parsed plan changes (programmatic, not AI)
export type TPlanResourceChange = {
  action: string;
  type: string;
  name: string;
  address: string;
  dependsOn: string[];
};

export type TPlanJson = {
  add: number;
  change: number;
  destroy: number;
  resources: TPlanResourceChange[];
};
