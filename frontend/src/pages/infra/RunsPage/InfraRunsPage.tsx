import { ClockIcon, UserIcon } from "lucide-react";

import {
  Badge,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";

const MOCK_RUNS = [
  { id: "run-0041", type: "apply", status: "success", changes: "+3 ~1 -0", duration: "12s", triggeredBy: "you", createdAt: "2 min ago" },
  { id: "run-0040", type: "plan", status: "success", changes: "+5 ~0 -0", duration: "4s", triggeredBy: "you", createdAt: "15 min ago" },
  { id: "run-0039", type: "apply", status: "failed", changes: "+0 ~1 -0", duration: "8s", triggeredBy: "you", createdAt: "1 hour ago" },
  { id: "run-0038", type: "apply", status: "success", changes: "+7 ~2 -1", duration: "23s", triggeredBy: "CI/CD", createdAt: "3 hours ago" },
  { id: "run-0037", type: "plan", status: "success", changes: "+2 ~0 -0", duration: "3s", triggeredBy: "you", createdAt: "1 day ago" },
  { id: "run-0036", type: "apply", status: "success", changes: "+0 ~3 -0", duration: "15s", triggeredBy: "CI/CD", createdAt: "1 day ago" },
  { id: "run-0035", type: "plan", status: "success", changes: "+1 ~0 -2", duration: "5s", triggeredBy: "you", createdAt: "2 days ago" },
  { id: "run-0034", type: "apply", status: "failed", changes: "+0 ~0 -1", duration: "6s", triggeredBy: "you", createdAt: "3 days ago" }
];

const statusVariant = (status: string): "success" | "danger" | "warning" => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    default:
      return "warning";
  }
};

export const InfraRunsPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-mineshaft-100">Runs</h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          History of all plan and apply operations.
        </p>
      </div>

      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Run ID</UnstableTableHead>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Changes</UnstableTableHead>
            <UnstableTableHead>Duration</UnstableTableHead>
            <UnstableTableHead>Triggered By</UnstableTableHead>
            <UnstableTableHead>Time</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {MOCK_RUNS.map((run) => (
            <UnstableTableRow key={run.id}>
              <UnstableTableCell className="font-mono text-xs">
                {run.id}
              </UnstableTableCell>
              <UnstableTableCell>
                <Badge variant={run.type === "apply" ? "success" : "info"}>
                  {run.type}
                </Badge>
              </UnstableTableCell>
              <UnstableTableCell>
                <Badge variant={statusVariant(run.status)}>
                  {run.status}
                </Badge>
              </UnstableTableCell>
              <UnstableTableCell className="font-mono text-xs text-mineshaft-300">
                {run.changes}
              </UnstableTableCell>
              <UnstableTableCell>
                <span className="flex items-center gap-1.5 text-xs text-mineshaft-400">
                  <ClockIcon className="size-3" />
                  {run.duration}
                </span>
              </UnstableTableCell>
              <UnstableTableCell>
                <span className="flex items-center gap-1.5 text-xs text-mineshaft-400">
                  <UserIcon className="size-3" />
                  {run.triggeredBy}
                </span>
              </UnstableTableCell>
              <UnstableTableCell className="text-xs text-mineshaft-400">
                {run.createdAt}
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
    </div>
  );
};
