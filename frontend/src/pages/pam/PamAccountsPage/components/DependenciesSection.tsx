import { Fragment, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, ChevronRight } from "lucide-react";

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3/generic/Tooltip";
import { TPamAccountDependency, useListPamAccountDependencies } from "@app/hooks/api/pam";

const TYPE_LABELS: Record<string, string> = {
  "windows-service": "Windows Service",
  "scheduled-task": "Scheduled Task",
  "iis-app-pool": "IIS App Pool"
};

const TYPE_DETAIL_FIELDS: Record<string, { key: string; label: string }[]> = {
  "windows-service": [
    { key: "pathName", label: "Binary path" },
    { key: "state", label: "State" }
  ],
  "scheduled-task": [
    { key: "taskPath", label: "Task path" },
    { key: "state", label: "State" }
  ],
  "iis-app-pool": [{ key: "state", label: "State" }]
};

const StatusBadge = ({ dep }: { dep: TPamAccountDependency }) => {
  if (dep.rotationStatus === "success") return <Badge variant="success">Rotated</Badge>;
  if (dep.rotationStatus === "pending") return <Badge variant="warning">Pending</Badge>;
  if (dep.rotationStatus === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge variant="danger" className="cursor-help gap-1">
                <AlertCircle className="size-3" /> Failed
              </Badge>
            </span>
          </TooltipTrigger>
          {dep.lastRotationMessage && (
            <TooltipContent className="max-w-xs break-words">
              {dep.lastRotationMessage}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <Badge variant="neutral">Never</Badge>;
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-xs text-muted">{label}</span>
    <span className="truncate font-mono text-xs text-foreground" title={value}>
      {value}
    </span>
  </div>
);

const DependencyDetail = ({ dep }: { dep: TPamAccountDependency }) => {
  const data = dep.data ?? {};
  const read = (key: string) => {
    const v = data[key];
    if (v === null || v === undefined || v === "") return null;
    return String(v);
  };

  const runAs = read("runAsAccount");
  const typeFields = TYPE_DETAIL_FIELDS[dep.type] ?? [];
  const lastRotated = dep.lastRotatedAt
    ? format(new Date(dep.lastRotatedAt), "MMM d, yyyy h:mm a")
    : "Never";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 lg:grid-cols-3">
        {runAs && <DetailRow label="Runs as" value={runAs} />}
        {typeFields.map((f) => {
          const value = read(f.key);
          return value ? <DetailRow key={f.key} label={f.label} value={value} /> : null;
        })}
        <DetailRow label="Last rotation" value={lastRotated} />
      </div>
      {dep.rotationStatus === "failed" && dep.lastRotationMessage && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {dep.lastRotationMessage}
        </div>
      )}
    </div>
  );
};

export const DependenciesSection = ({ accountId }: { accountId: string }) => {
  const { data: dependencies } = useListPamAccountDependencies(accountId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const deps = dependencies ?? [];
  if (deps.length === 0) return null;

  const machineCount = new Set(deps.map((d) => d.machine)).size;

  return (
    <div className="rounded-lg border border-border bg-container p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Dependencies</h3>
        <Badge variant="pam">{deps.length}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted">
        Rotating this account updates {deps.length}{" "}
        {deps.length === 1 ? "dependency" : "dependencies"} across {machineCount}{" "}
        {machineCount === 1 ? "machine" : "machines"}.
      </p>
      <Table className="w-full table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="w-44">Name</TableHead>
            <TableHead className="w-40">Type</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead className="w-36">Rotation Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deps.map((dep) => {
            const isExpanded = Boolean(expanded[dep.id]);
            return (
              <Fragment key={dep.id}>
                <TableRow
                  className={`cursor-pointer [&>td]:h-12 ${
                    isExpanded ? "border-b-0 bg-container-hover" : ""
                  }`}
                  onClick={() => setExpanded((prev) => ({ ...prev, [dep.id]: !prev[dep.id] }))}
                >
                  <TableCell>
                    <ChevronRight
                      className={`size-4 text-muted transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  </TableCell>
                  <TableCell title={dep.name} className="truncate font-medium text-foreground">
                    {dep.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{TYPE_LABELS[dep.type] ?? dep.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block truncate">{dep.machine}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm font-mono break-words">
                          {dep.machine}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <StatusBadge dep={dep} />
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-container-hover px-6 pt-3 pb-4">
                      <DependencyDetail dep={dep} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
