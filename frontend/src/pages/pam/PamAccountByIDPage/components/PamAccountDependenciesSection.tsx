import { useState } from "react";
import { format } from "date-fns";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import type { TPamAccount, TPamAccountDependency } from "@app/hooks/api/pam";
import {
  useDeletePamAccountDependency,
  useGetPamAccountDependencies,
  useTogglePamAccountDependency
} from "@app/hooks/api/pam";

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

const COL_COUNT = 7;
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

const DependencyRow = ({
  dep,
  accountId,
  toggleMutation,
  onDeleteClick
}: {
  dep: TPamAccountDependency;
  accountId: string;
  toggleMutation: ReturnType<typeof useTogglePamAccountDependency>;
  onDeleteClick: (dep: TPamAccountDependency) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const dataEntries = Object.entries(dep.data || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .sort((a, b) => (DATA_KEY_ORDER[a[0]] ?? 0) - (DATA_KEY_ORDER[b[0]] ?? 0));

  return (
    <>
      <UnstableTableRow className="group cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <UnstableTableCell className="w-5">
          {isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted" />
          )}
        </UnstableTableCell>
        <UnstableTableCell className="font-medium">{dep.displayName || dep.name}</UnstableTableCell>
        <UnstableTableCell>
          <Badge variant="info">
            {DEPENDENCY_TYPE_LABEL[dep.dependencyType] || dep.dependencyType}
          </Badge>
        </UnstableTableCell>
        <UnstableTableCell className="text-muted">{dep.resourceName ?? "-"}</UnstableTableCell>
        <UnstableTableCell className="text-muted">{dep.state ?? "-"}</UnstableTableCell>
        <UnstableTableCell>
          {dep.isRotationSyncEnabled ? (
            <Badge variant="success">Enabled</Badge>
          ) : (
            <Badge variant="neutral">Disabled</Badge>
          )}
        </UnstableTableCell>
        <UnstableTableCell>
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <UnstableIconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
                <EllipsisVerticalIcon />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent sideOffset={2} align="end">
              <UnstableDropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMutation.mutate({
                    accountId,
                    dependencyId: dep.id,
                    isRotationSyncEnabled: !dep.isRotationSyncEnabled
                  });
                }}
              >
                {dep.isRotationSyncEnabled ? "Disable Rotation Sync" : "Enable Rotation Sync"}
              </UnstableDropdownMenuItem>
              <UnstableDropdownMenuItem
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(dep);
                }}
              >
                <TrashIcon className="size-4" />
                Delete
              </UnstableDropdownMenuItem>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </UnstableTableCell>
      </UnstableTableRow>
      {isExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={COL_COUNT} className="bg-mineshaft-700/30 px-6 py-4">
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
                <span className="text-muted">Resource</span>
                <span>{dep.resourceName ?? "-"}</span>
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
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};

export const PamAccountDependenciesSection = ({ account }: { account: TPamAccount }) => {
  const { data: dependencies, isPending } = useGetPamAccountDependencies(account.id);
  const toggleMutation = useTogglePamAccountDependency();
  const deleteMutation = useDeletePamAccountDependency();

  const [deleteTarget, setDeleteTarget] = useState<TPamAccountDependency | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({
        accountId: account.id,
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
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead className="w-5" />
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>Resource</UnstableTableHead>
            <UnstableTableHead>State</UnstableTableHead>
            <UnstableTableHead>
              <div className="flex items-center gap-1">
                Rotation Sync
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CircleHelpIcon className="size-3.5 text-muted" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    When enabled, secret rotation will automatically sync credentials to this
                    dependency after rotating the account password
                  </TooltipContent>
                </Tooltip>
              </div>
            </UnstableTableHead>
            <UnstableTableHead className="w-5" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={COL_COUNT} className="text-center text-muted">
                Loading dependencies...
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending && (!dependencies || dependencies.length === 0) && (
            <UnstableTableRow>
              <UnstableTableCell colSpan={COL_COUNT}>
                <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                  <UnstableEmptyHeader>
                    <UnstableEmptyTitle>No dependencies discovered</UnstableEmptyTitle>
                  </UnstableEmptyHeader>
                </UnstableEmpty>
              </UnstableTableCell>
            </UnstableTableRow>
          )}
          {!isPending &&
            dependencies?.map((dep) => (
              <DependencyRow
                key={dep.id}
                dep={dep}
                accountId={account.id}
                toggleMutation={toggleMutation}
                onDeleteClick={setDeleteTarget}
              />
            ))}
        </UnstableTableBody>
      </UnstableTable>

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
