import { useState } from "react";
import { format, formatDistance } from "date-fns";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  EllipsisVerticalIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import type { TPamAccountDependency } from "@app/hooks/api/pam";
import { useDeletePamAccountDependency, useTogglePamAccountDependency } from "@app/hooks/api/pam";

const DEPENDENCY_TYPE_LABEL: Record<string, string> = {
  "windows-service": "Service",
  "scheduled-task": "Task",
  "iis-app-pool": "App Pool"
};

const DATA_LABEL_MAP: Record<string, string> = {
  runAsAccount: "Run As Account",
  startMode: "Start Mode",
  processId: "Process ID",
  pathName: "Path",
  description: "Description",
  taskPath: "Task Path",
  logonType: "Logon Type",
  runLevel: "Run Level",
  lastRunTime: "Last Run",
  nextRunTime: "Next Run",
  lastTaskResult: "Last Result",
  triggers: "Triggers",
  actions: "Actions",
  managedRuntimeVersion: "Runtime Version",
  managedPipelineMode: "Pipeline Mode",
  autoStart: "Auto Start",
  identityType: "Identity Type"
};

const DATA_KEY_ORDER: Record<string, number> = { actions: -2, triggers: -1 };

const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "-" : JSON.stringify(value, null, 2);
  if ((key === "lastRunTime" || key === "nextRunTime") && typeof value === "string") {
    try {
      return format(new Date(value), "MMM d, yyyy HH:mm");
    } catch {
      return String(value);
    }
  }
  return String(value);
};

type TDependencyItem = TPamAccountDependency & {
  accountName?: string | null;
};

const DependencyRow = ({
  dep,
  contextColumn,
  colCount,
  toggleMutation,
  onDeleteClick
}: {
  dep: TDependencyItem;
  contextColumn: { label: string; value: string | null | undefined };
  colCount: number;
  toggleMutation: ReturnType<typeof useTogglePamAccountDependency>;
  onDeleteClick: (dep: TDependencyItem) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const dataEntries = Object.entries(dep.data || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .sort((a, b) => (DATA_KEY_ORDER[a[0]] ?? 0) - (DATA_KEY_ORDER[b[0]] ?? 0));

  return (
    <>
      <TableRow className="group cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <TableCell className="w-5">
          {isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted" />
          )}
        </TableCell>
        <TableCell className="font-medium">{dep.displayName || dep.name}</TableCell>
        <TableCell>
          <Badge variant="info">
            {DEPENDENCY_TYPE_LABEL[dep.dependencyType] || dep.dependencyType}
          </Badge>
        </TableCell>
        <TableCell className="text-muted">{contextColumn.value ?? "-"}</TableCell>
        <TableCell className="text-muted">{dep.state ?? "-"}</TableCell>
        <TableCell>
          {dep.isRotationSyncEnabled ? (
            <Badge variant="success">Enabled</Badge>
          ) : (
            <Badge variant="neutral">Disabled</Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">
              {dep.lastSyncedAt
                ? formatDistance(new Date(dep.lastSyncedAt), new Date(), { addSuffix: true })
                : "Never"}
            </span>
            {dep.syncStatus === "failed" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger" className="text-xs">
                    Failed
                  </Badge>
                </TooltipTrigger>
                {dep.lastSyncMessage && (
                  <TooltipContent className="max-w-sm">{dep.lastSyncMessage}</TooltipContent>
                )}
              </Tooltip>
            )}
            {dep.syncStatus === "pending" && (
              <Badge variant="info" className="animate-pulse text-xs">
                Pending
              </Badge>
            )}
            {dep.syncStatus === "success" && (
              <Badge variant="success" className="text-xs">
                Success
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                <EllipsisVerticalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMutation.mutate({
                    accountId: dep.accountId,
                    dependencyId: dep.id,
                    isRotationSyncEnabled: !dep.isRotationSyncEnabled
                  });
                }}
              >
                {dep.isRotationSyncEnabled ? "Disable Rotation Sync" : "Enable Rotation Sync"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(dep);
                }}
              >
                <TrashIcon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={colCount} className="bg-mineshaft-700/30 px-6 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between border-b border-mineshaft-600 py-1">
                <span className="text-muted">Name</span>
                <span className="font-mono text-xs">{dep.name}</span>
              </div>
              <div className="flex justify-between border-b border-mineshaft-600 py-1">
                <span className="text-muted">Source</span>
                <span>{dep.source}</span>
              </div>
              <div className="flex justify-between border-b border-mineshaft-600 py-1">
                <span className="text-muted">{contextColumn.label}</span>
                <span>{contextColumn.value ?? "-"}</span>
              </div>
              <div className="flex justify-between border-b border-mineshaft-600 py-1">
                <span className="text-muted">Last Discovered</span>
                <span>{format(new Date(dep.updatedAt), "MMM d, yyyy HH:mm")}</span>
              </div>
              {dataEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-mineshaft-600 py-1">
                  <span className="text-muted">{DATA_LABEL_MAP[key] || key}</span>
                  {Array.isArray(value) && value.length > 0 ? (
                    <pre className="max-h-32 max-w-xs overflow-auto rounded bg-mineshaft-800 px-2 py-1 font-mono text-xs">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <span className="font-mono text-xs">{formatValue(key, value)}</span>
                  )}
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

type PamDependenciesTableProps = {
  dependencies: TDependencyItem[] | undefined;
  isPending: boolean;
  contextColumnLabel: string;
  getContextValue: (dep: TDependencyItem) => string | null | undefined;
};

const COL_COUNT = 8;

export const PamDependenciesTable = ({
  dependencies,
  isPending,
  contextColumnLabel,
  getContextValue
}: PamDependenciesTableProps) => {
  const toggleMutation = useTogglePamAccountDependency();
  const deleteMutation = useDeletePamAccountDependency();
  const [deleteTarget, setDeleteTarget] = useState<TDependencyItem | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({
        accountId: deleteTarget.accountId,
        dependencyId: deleteTarget.id
      });
      createNotification({ text: "Dependency deleted", type: "success" });
      setDeleteTarget(null);
    } catch {
      createNotification({ text: "Failed to delete dependency", type: "error" });
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-5" />
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>{contextColumnLabel}</TableHead>
            <TableHead>State</TableHead>
            <TableHead>
              <div className="flex items-center gap-1">
                Rotation Sync
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelpIcon className="size-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    When enabled, this dependency&apos;s credentials will be automatically updated
                    to match whenever the account password is rotated
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableHead>
            <TableHead>Last Synced</TableHead>
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && (
            <TableRow>
              <TableCell colSpan={COL_COUNT} className="text-center text-muted">
                Loading dependencies...
              </TableCell>
            </TableRow>
          )}
          {!isPending && (!dependencies || dependencies.length === 0) && (
            <TableRow>
              <TableCell colSpan={COL_COUNT}>
                <Empty className="border-0 bg-transparent py-8 shadow-none">
                  <EmptyHeader>
                    <EmptyTitle>No dependencies discovered</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
          {!isPending &&
            dependencies?.map((dep) => (
              <DependencyRow
                key={dep.id}
                dep={dep}
                contextColumn={{
                  label: contextColumnLabel,
                  value: getContextValue(dep)
                }}
                colCount={COL_COUNT}
                toggleMutation={toggleMutation}
                onDeleteClick={setDeleteTarget}
              />
            ))}
        </TableBody>
      </Table>

      <DeleteActionModal
        isOpen={!!deleteTarget}
        title={`Delete dependency "${deleteTarget?.displayName || deleteTarget?.name}"?`}
        subTitle="This will permanently remove this dependency and break the audit trail for rotation tracking."
        onChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </>
  );
};
