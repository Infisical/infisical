import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  Trash2Icon
} from "lucide-react";

import { Skeleton } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useInfraResources,
  useInfraState,
  useInfraStateHistory,
  usePurgeInfraState
} from "@app/hooks/api/infra";
import { TInfraRun, TPlanJson } from "@app/hooks/api/infra/types";

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString();
};

const formatRelative = (dateStr: string) => {
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

export const InfraStatePage = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  const { data: state, isLoading: stateLoading } = useInfraState(projectId);
  const { data: resources, isLoading: resourcesLoading } = useInfraResources(projectId);
  const { data: history, isLoading: historyLoading } = useInfraStateHistory(projectId);
  const purgeState = usePurgeInfraState();

  const [rawExpanded, setRawExpanded] = useState(false);

  const hasState = state !== null && state !== undefined;

  const resourceCount = resources?.length ?? 0;

  const stateVersion = useMemo(() => {
    if (!state) return null;
    const s = state as { version?: number; serial?: number; lineage?: string };
    return { version: s.version, serial: s.serial, lineage: s.lineage };
  }, [state]);

  const handlePurge = async () => {
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      "Are you sure you want to purge the state? This will make Infisical forget all managed resources. The actual cloud resources will NOT be deleted, but they will become unmanaged. This action cannot be undone."
    );
    if (!confirmed) return;
    await purgeState.mutateAsync({ projectId });
  };

  if (stateLoading || resourcesLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">State</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            OpenTofu state — tracks which real infrastructure resources are managed by this project.
          </p>
        </div>
        {hasState && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2Icon className="size-4" />}
            onClick={handlePurge}
            isPending={purgeState.isPending}
          >
            Purge State
          </Button>
        )}
      </div>

      {/* State overview */}
      {hasState ? (
        <div className="grid grid-cols-4 gap-4">
          <UnstableCard>
            <UnstableCardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Resources</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">{resourceCount}</p>
                <p className="mt-0.5 text-xs text-mineshaft-500">managed</p>
              </div>
              <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-primary">
                <BoxIcon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
          <UnstableCard>
            <UnstableCardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Serial</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                  {stateVersion?.serial ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-mineshaft-500">state version</p>
              </div>
              <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-blue-400">
                <DatabaseIcon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
          <UnstableCard>
            <UnstableCardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Format Version</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                  {stateVersion?.version ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-mineshaft-500">tofu state format</p>
              </div>
              <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-green-400">
                <DatabaseIcon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
          <UnstableCard>
            <UnstableCardContent className="p-5">
              <p className="text-xs font-medium text-mineshaft-400">Lineage</p>
              <p className="mt-1 truncate font-mono text-xs text-mineshaft-300">
                {stateVersion?.lineage ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-mineshaft-500">unique state identifier</p>
            </UnstableCardContent>
          </UnstableCard>
        </div>
      ) : (
        <UnstableCard>
          <UnstableCardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <DatabaseIcon className="size-8 text-mineshaft-500" />
            <p className="text-sm text-mineshaft-400">
              No state exists yet. Run an Apply in the Editor to create infrastructure and
              initialize state.
            </p>
          </UnstableCardContent>
        </UnstableCard>
      )}

      {/* Current Resources */}
      {hasState && resources && resources.length > 0 && (
        <UnstableCard>
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Managed Resources
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="p-0">
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead>Type</UnstableTableHead>
                  <UnstableTableHead>Name</UnstableTableHead>
                  <UnstableTableHead>Provider</UnstableTableHead>
                  <UnstableTableHead>Address</UnstableTableHead>
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {resources.map((r) => (
                  <UnstableTableRow key={r.address}>
                    <UnstableTableCell>
                      <Badge variant="info">{r.type}</Badge>
                    </UnstableTableCell>
                    <UnstableTableCell className="font-mono text-xs text-mineshaft-200">
                      {r.name}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-xs text-mineshaft-400">
                      {r.provider}
                    </UnstableTableCell>
                    <UnstableTableCell className="font-mono text-xs text-mineshaft-300">
                      {r.address}
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              </UnstableTableBody>
            </UnstableTable>
          </UnstableCardContent>
        </UnstableCard>
      )}

      {/* State History */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
            State History
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent className="p-0">
          {historyLoading ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="p-6 text-center text-sm text-mineshaft-500">
              No state changes yet. State is modified when Apply or Destroy runs complete
              successfully.
            </div>
          ) : (
            <div className="divide-y divide-mineshaft-600">
              {history.map((run: TInfraRun) => {
                const plan = run.planJson as TPlanJson | null;
                return (
                  <Link
                    key={run.id}
                    to="/organizations/$orgId/projects/infra/$projectId/run/$runId"
                    params={{
                      orgId: currentOrg.id,
                      projectId,
                      runId: run.id
                    }}
                    className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-mineshaft-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-block size-2 rounded-full bg-green-500" />
                      <span className="font-mono text-xs text-mineshaft-300">
                        {run.id.slice(0, 8)}
                      </span>
                      <Badge
                        variant={run.type === "destroy" ? "danger" : "success"}
                      >
                        {run.type}
                      </Badge>
                      {plan && (
                        <span className="flex items-center gap-2 text-xs">
                          {plan.add > 0 && (
                            <span className="text-green-400">+{plan.add}</span>
                          )}
                          {plan.change > 0 && (
                            <span className="text-yellow-400">~{plan.change}</span>
                          )}
                          {plan.destroy > 0 && (
                            <span className="text-red-400">-{plan.destroy}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-mineshaft-400">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3" />
                        {formatRelative(run.createdAt)}
                      </span>
                      <span className="text-mineshaft-600">{formatDate(run.createdAt)}</span>
                      <ChevronRightIcon className="size-3.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </UnstableCardContent>
      </UnstableCard>

      {/* Raw State (collapsible) */}
      {hasState && (
        <UnstableCard>
          <UnstableCardHeader>
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setRawExpanded(!rawExpanded)}
            >
              {rawExpanded ? (
                <ChevronDownIcon className="size-4 text-mineshaft-400" />
              ) : (
                <ChevronRightIcon className="size-4 text-mineshaft-400" />
              )}
              <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                Raw State JSON
              </UnstableCardTitle>
              <Badge variant="warning">
                <AlertTriangleIcon className="size-3" />
                Advanced
              </Badge>
            </button>
          </UnstableCardHeader>
          {rawExpanded && (
            <UnstableCardContent className="pt-0">
              <pre className="max-h-[600px] overflow-auto rounded-md bg-[#1e1e1e] p-4 font-mono text-xs leading-5 text-mineshaft-300">
                {JSON.stringify(state, null, 2)}
              </pre>
            </UnstableCardContent>
          )}
        </UnstableCard>
      )}
    </div>
  );
};
