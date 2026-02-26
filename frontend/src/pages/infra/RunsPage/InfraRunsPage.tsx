import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangleIcon, ClockIcon } from "lucide-react";

import {
  Badge,
  Skeleton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useInfraRuns } from "@app/hooks/api/infra";
import { TInfraRun, TPlanJson } from "@app/hooks/api/infra/types";

const statusVariant = (status: string): "success" | "danger" | "warning" | "info" => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "warning";
    case "awaiting_approval":
      return "warning";
    default:
      return "info";
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

export const InfraRunsPage = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: runs, isLoading } = useInfraRuns(currentProject.id);
  const navigate = useNavigate();

  // Filter out denied runs — they are cancelled and should not appear
  const visibleRuns = useMemo(() => {
    if (!runs) return null;
    return runs.filter((r) => r.status !== "denied");
  }, [runs]);

  const handleRowClick = (runId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/infra/$projectId/run/$runId",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id,
        runId
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-mineshaft-100">Runs</h1>
        <p className="mt-1 text-sm text-mineshaft-400">History of all plan and apply operations.</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !visibleRuns || visibleRuns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-mineshaft-600 p-8 text-center text-sm text-mineshaft-400">
          No runs yet. Go to the Editor tab to run your first plan or apply.
        </div>
      ) : (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Run ID</UnstableTableHead>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Status</UnstableTableHead>
              <UnstableTableHead>Changes</UnstableTableHead>
              <UnstableTableHead>Time</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {visibleRuns.map((run: TInfraRun) => {
              const plan = run.planJson as TPlanJson | null;
              return (
                <UnstableTableRow
                  key={run.id}
                  className="cursor-pointer transition-colors hover:bg-mineshaft-700/30"
                  onClick={() => handleRowClick(run.id)}
                >
                  <UnstableTableCell className="font-mono text-xs">
                    {run.id.slice(0, 8)}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <Badge variant={run.type === "destroy" ? "danger" : run.type === "apply" ? "success" : "info"}>{run.type}</Badge>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={statusVariant(run.status)}>
                        {run.status === "awaiting_approval" ? "awaiting approval" : run.status}
                      </Badge>
                      {run.status === "awaiting_approval" && (
                        <AlertTriangleIcon className="size-3.5 text-yellow-400" />
                      )}
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {plan ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">+{plan.add}</span>
                        <span className="text-yellow-400">~{plan.change}</span>
                        <span className="text-red-400">-{plan.destroy}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-mineshaft-600">—</span>
                    )}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <span className="flex items-center gap-1.5 text-xs text-mineshaft-400">
                      <ClockIcon className="size-3" />
                      {formatDate(run.createdAt)}
                    </span>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      )}
    </div>
  );
};
