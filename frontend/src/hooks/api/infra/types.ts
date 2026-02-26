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
  dependsOn: string[];
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
  dependsOn: string[];
};

export type TInfraGraphNode = {
  id: string;
  type: string;
  name: string;
  provider: string;
};

export type TInfraGraph = {
  nodes: TInfraGraphNode[];
  edges: Array<{ source: string; target: string }>;
};

/** Build a run-specific graph from planJson resources and their dependencies */
export function buildGraphFromPlanJson(planJson: TPlanJson): TInfraGraph {
  const addressSet = new Set(planJson.resources.map((r) => r.address));

  const nodes: TInfraGraphNode[] = planJson.resources.map((r) => ({
    id: r.address,
    type: r.type,
    name: r.name,
    provider: r.type.split("_")[0] ?? "unknown"
  }));

  const edgeSet = new Set<string>();
  const edges: Array<{ source: string; target: string }> = [];

  for (const r of planJson.resources) {
    for (const dep of r.dependsOn) {
      if (addressSet.has(dep)) {
        const key = `${dep}->${r.address}`;
        if (!edgeSet.has(key)) {
          edges.push({ source: dep, target: r.address });
          edgeSet.add(key);
        }
      }
    }
  }

  return { nodes, edges };
}
export type TInfraVariable = {
  id: string;
  projectId: string;
  key: string;
  value: string;
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
};
