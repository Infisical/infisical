export type TInfraFile = {
  id: string;
  projectId: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type TPlanResourceChange = {
  action: string;
  type: string;
  name: string;
  address: string;
};

export type TPlanJson = {
  add: number;
  change: number;
  destroy: number;
  resources: TPlanResourceChange[];
};

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

export type TInfraRun = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  logs: string;
  planJson: TPlanJson | null;
  aiSummary: string | null;
  fileSnapshot: Record<string, string> | null;
  triggeredBy: string | null;
  planRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TRunResult = {
  output: string;
  status: string;
  runId: string;
  planJson: TPlanJson | null;
  aiSummary: string | null;
};

export type TInfraResource = {
  type: string;
  name: string;
  provider: string;
  address: string;
  attributes: Record<string, unknown>;
};
