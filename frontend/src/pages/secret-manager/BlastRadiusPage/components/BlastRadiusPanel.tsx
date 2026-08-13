import { useCallback, useMemo, useState } from "react";
import { NetworkIcon, RefreshCwIcon, TableIcon } from "lucide-react";

import {
  Badge,
  Button,
  ButtonGroup,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BlastRadiusLeg,
  BlastRadiusWindow,
  ExposureBand,
  PrincipalAccessFilter,
  PrincipalOrder,
  PrincipalUsageFilter,
  SyncStatusFilter,
  TBlastRadiusPrincipal,
  useGetSecretBlastRadius,
  useSimulateSecretRotation
} from "@app/hooks/api/blastRadius";
import { usePopUp } from "@app/hooks/usePopUp";

import { principalNodeId } from "../utils/buildGraph";
import { EXPOSURE_BAND_LABEL, EXPOSURE_BAND_VARIANT, summarizeBlastRadius } from "../utils/format";
import { BlastRadiusFilters, TBlastRadiusFilterState } from "./BlastRadiusFilters";
import { BlastRadiusGraph } from "./BlastRadiusGraph";
import { BlastRadiusTable } from "./BlastRadiusTable";
import { GraphLegend } from "./GraphLegend";
import { RotationSimulationModal } from "./RotationSimulationModal";

const PRINCIPAL_PAGE_SIZE = 50;

enum ViewMode {
  Graph = "graph",
  Table = "table"
}

export type TBlastRadiusPanelProps = {
  projectId: string;
  orgId: string;
  secretKey: string;
  environment: string;
  secretPath: string;
  // Set when rendered in a Sheet: `SheetContent` draws its own close X at top-4 right-4, so the header
  // has to leave room for it rather than adding a second close control.
  reserveCloseAffordance?: boolean;
};

export const BlastRadiusPanel = ({
  projectId,
  orgId,
  secretKey,
  environment,
  secretPath,
  reserveCloseAffordance
}: TBlastRadiusPanelProps) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["rotationSimulation"] as const);

  const [viewMode, setViewMode] = useState(ViewMode.Graph);
  const [activityWindow] = useState(BlastRadiusWindow.ThirtyDays);
  const [principalLimit, setPrincipalLimit] = useState(PRINCIPAL_PAGE_SIZE);
  const [filters, setFilters] = useState<TBlastRadiusFilterState>({
    access: PrincipalAccessFilter.All,
    usage: PrincipalUsageFilter.All,
    syncStatus: SyncStatusFilter.All
  });
  const [selectedPrincipal, setSelectedPrincipal] = useState<TBlastRadiusPrincipal | undefined>();

  const baseDto = {
    projectId,
    secretKey,
    environment,
    secretPath,
    window: activityWindow,
    principalLimit,
    principalOrder: PrincipalOrder.NoReadsFirst,
    principalAccess: filters.access,
    principalUsage: filters.usage
  };

  // Entitlement and distribution resolve quickly; activity has to aggregate the audit log. Painting the
  // fast legs first means every edge starts dashed, which is the pessimistic and honest state.
  const { data: fastLegs, isPending: isFastPending } = useGetSecretBlastRadius({
    ...baseDto,
    include: [BlastRadiusLeg.Entitlement, BlastRadiusLeg.Distribution]
  });
  const { data: fullGraph, isPending: isActivityPending } = useGetSecretBlastRadius(baseDto);

  const blastRadius = fullGraph ?? fastLegs;
  const isCheckingActivity = Boolean(fastLegs) && isActivityPending;

  const { data: simulation, isPending: isSimulationPending } = useSimulateSecretRotation(
    { projectId, secretKey, environment, secretPath, window: activityWindow },
    { enabled: popUp.rotationSimulation.isOpen }
  );

  const accessHref = useMemo(
    () => `/organizations/${orgId}/projects/secret-management/${projectId}/access-management`,
    [orgId, projectId]
  );
  const roleHref = useCallback(
    (roleSlug: string) =>
      `/organizations/${orgId}/projects/secret-management/${projectId}/roles/${roleSlug}`,
    [orgId, projectId]
  );

  // Memoised because it travels inside node data: a fresh object each render would rebuild the graph.
  const popover = useMemo(
    () => ({
      accessHref,
      roleHref,
      onClose: () => setSelectedPrincipal(undefined)
    }),
    [accessHref, roleHref]
  );

  const exposure = blastRadius?.exposure;
  const isScored = exposure && exposure.band !== ExposureBand.Unavailable;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          reserveCloseAffordance && "pr-12"
        )}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-foreground">Blast Radius</h2>
          <span className="truncate font-mono text-sm text-accent">{secretKey}</span>
          <span className="truncate font-mono text-xs text-muted">
            {secretPath} · {environment}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {exposure && (
            <Badge variant={EXPOSURE_BAND_VARIANT[exposure.band]}>
              {EXPOSURE_BAND_LABEL[exposure.band]}
              {isScored ? ` · ${exposure.score}` : ""}
            </Badge>
          )}
          <Button
            size="xs"
            variant="project"
            isDisabled={!blastRadius}
            onClick={() => handlePopUpOpen("rotationSimulation")}
          >
            <RefreshCwIcon />
            Simulate Rotation
          </Button>
        </div>
      </div>

      {/* The former header card, as one sentence. Drivers live in the exposure badge's tooltip target
          rather than taking a third of the drawer. */}
      <div className="border-y border-border bg-container px-4 py-2.5">
        {blastRadius ? (
          <p className="text-xs text-accent">{summarizeBlastRadius(blastRadius)}</p>
        ) : (
          <Skeleton className="h-4 w-96" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <BlastRadiusFilters filters={filters} onChange={setFilters} />
        <ButtonGroup>
          {/* `aria-pressed` is what states the toggle to a screen reader, and ButtonGroup also keys its
              z-10 rule off it. Without it the group's 1px overlap lets the later button paint over the
              selected one's shared border, so an active Graph loses its right edge. */}
          <Button
            size="xs"
            variant={viewMode === ViewMode.Graph ? "project" : "outline"}
            aria-pressed={viewMode === ViewMode.Graph}
            onClick={() => setViewMode(ViewMode.Graph)}
          >
            <NetworkIcon />
            Graph
          </Button>
          <Button
            size="xs"
            variant={viewMode === ViewMode.Table ? "project" : "outline"}
            aria-pressed={viewMode === ViewMode.Table}
            onClick={() => setViewMode(ViewMode.Table)}
          >
            <TableIcon />
            Table
          </Button>
        </ButtonGroup>
      </div>

      {isFastPending && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4">
          <Skeleton className="min-h-0 flex-1" />
        </div>
      )}

      {!isFastPending && blastRadius && viewMode === ViewMode.Graph && (
        <>
          {/* Column headers are band-label nodes inside the graph, so they scroll with the column they
              name and can carry its one-line explanation. The graph also owns its own scroll container,
              so the zoom controls can sit outside it. */}
          <BlastRadiusGraph
            blastRadius={blastRadius}
            hideHealthyDestinations={filters.syncStatus === SyncStatusFilter.Unhealthy}
            selectedPrincipalId={selectedPrincipal ? principalNodeId(selectedPrincipal) : undefined}
            popover={popover}
            onSelectPrincipal={setSelectedPrincipal}
          />

          <GraphLegend
            blastRadius={blastRadius}
            isCheckingActivity={isCheckingActivity}
            onDrawMore={() => setPrincipalLimit((limit) => limit + PRINCIPAL_PAGE_SIZE)}
          />
        </>
      )}

      {!isFastPending && blastRadius && viewMode === ViewMode.Table && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <BlastRadiusTable blastRadius={blastRadius} onSelectPrincipal={setSelectedPrincipal} />
        </div>
      )}

      {!isFastPending && !blastRadius && (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>Nothing to show</EmptyTitle>
            <EmptyDescription>
              This secret could not be resolved at {secretPath} in {environment}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <RotationSimulationModal
        isOpen={popUp.rotationSimulation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("rotationSimulation", isOpen)}
        simulation={simulation}
        isPending={isSimulationPending}
        currentVersion={blastRadius?.secret.version}
      />
    </div>
  );
};
