import { useCallback, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";
import { FolderIcon, KeyRoundIcon, LayersIcon, NetworkIcon, TableIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Button,
  ButtonGroup,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useSubscription } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import {
  BlastRadiusLeg,
  BlastRadiusWindow,
  PrincipalAccessFilter,
  PrincipalOrder,
  PrincipalUsageFilter,
  SyncStatusFilter,
  TBlastRadiusPrincipal,
  useGetSecretBlastRadius,
  useSimulateSecretRotation
} from "@app/hooks/api/blastRadius";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { BlastRadiusFilters, TBlastRadiusFilterState } from "./components/BlastRadiusFilters";
import { BlastRadiusGraph } from "./components/BlastRadiusGraph";
import { BlastRadiusTable } from "./components/BlastRadiusTable";
import { ExplainPanel } from "./components/ExplainPanel";
import { ExposureHeader } from "./components/ExposureHeader";
import { HealthyStateNote } from "./components/HealthyStateNote";
import { RotationSimulationModal } from "./components/RotationSimulationModal";
import { TruncationBanner } from "./components/TruncationBanner";
import { principalNodeId } from "./utils/buildGraph";

const PRINCIPAL_PAGE_SIZE = 50;

enum ViewMode {
  Graph = "graph",
  Table = "table"
}

export const BlastRadiusPage = withProjectPermission(
  () => {
    const { projectId, orgId } = useParams({
      from: ROUTE_PATHS.SecretManager.BlastRadiusPage.id
    });
    const search = useSearch({ from: ROUTE_PATHS.SecretManager.BlastRadiusPage.id });
    const { subscription } = useSubscription();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "upgradePlan",
      "rotationSimulation"
    ] as const);

    const [viewMode, setViewMode] = useState(ViewMode.Graph);
    const [activityWindow, setActivityWindow] = useState(BlastRadiusWindow.ThirtyDays);
    const [principalLimit, setPrincipalLimit] = useState(PRINCIPAL_PAGE_SIZE);
    const [filters, setFilters] = useState<TBlastRadiusFilterState>({
      access: PrincipalAccessFilter.All,
      usage: PrincipalUsageFilter.All,
      syncStatus: SyncStatusFilter.All,
      clusterUnusedAccess: true
    });
    const [selectedPrincipal, setSelectedPrincipal] = useState<TBlastRadiusPrincipal | undefined>();

    const baseDto = {
      projectId,
      secretKey: search.secretKey,
      environment: search.environment,
      secretPath: search.secretPath,
      window: activityWindow,
      principalLimit,
      principalOrder: PrincipalOrder.NoReadsFirst,
      principalAccess: filters.access,
      principalUsage: filters.usage
    };

    const canUseFeature = Boolean(subscription?.secretAccessInsights);

    // Entitlement and distribution resolve quickly; activity has to aggregate the audit log. Painting
    // the fast legs first means every edge starts dashed, which is the pessimistic and honest state.
    const { data: fastLegs, isPending: isFastPending } = useGetSecretBlastRadius(
      { ...baseDto, include: [BlastRadiusLeg.Entitlement, BlastRadiusLeg.Distribution] },
      { enabled: canUseFeature }
    );
    const { data: fullGraph, isPending: isActivityPending } = useGetSecretBlastRadius(baseDto, {
      enabled: canUseFeature
    });

    const blastRadius = fullGraph ?? fastLegs;
    const isCheckingActivity = Boolean(fastLegs) && isActivityPending;

    const { data: simulation, isPending: isSimulationPending } = useSimulateSecretRotation(
      {
        projectId,
        secretKey: search.secretKey,
        environment: search.environment,
        secretPath: search.secretPath,
        window: activityWindow
      },
      { enabled: canUseFeature && popUp.rotationSimulation.isOpen }
    );

    const auditLogHref = useMemo(
      () => `/organizations/${orgId}/audit-logs?projectId=${projectId}`,
      [orgId, projectId]
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

    if (!canUseFeature) {
      return (
        <div className="p-6">
          <UpgradePlanModal
            isOpen
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text="Blast radius can be unlocked if you upgrade to Infisical Pro."
          />
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-5">
        <Helmet>
          <title>{`Blast Radius · ${search.secretKey}`}</title>
        </Helmet>

        <PageHeader
          scope={ProjectType.SecretManager}
          title="Blast Radius"
          description="Who can read this secret, and what depends on its value."
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-accent">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <KeyRoundIcon className="size-3.5 text-secret" />
                <span className="ml-1 font-mono text-foreground/75">{search.secretKey}</span>
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <LayersIcon className="size-3.5 text-accent" />
                <span className="ml-1 text-foreground/75">
                  {blastRadius?.secret.environmentName ?? search.environment}
                </span>
              </span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <FolderIcon className="size-3.5 text-folder" />
                <span className="ml-1 font-mono text-foreground/75">{search.secretPath}</span>
              </span>
            </div>

            <Separator orientation="vertical" className="mx-1 h-5" />

            <Select
              value={activityWindow}
              onValueChange={(value) => setActivityWindow(value as BlastRadiusWindow)}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(BlastRadiusWindow).map((option) => (
                  <SelectItem key={option} value={option}>
                    Last {option.replace("d", " days")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ButtonGroup>
              <Button
                size="xs"
                variant={viewMode === ViewMode.Graph ? "project" : "outline"}
                onClick={() => setViewMode(ViewMode.Graph)}
              >
                <NetworkIcon />
                Graph
              </Button>
              <Button
                size="xs"
                variant={viewMode === ViewMode.Table ? "project" : "outline"}
                onClick={() => setViewMode(ViewMode.Table)}
              >
                <TableIcon />
                Table
              </Button>
            </ButtonGroup>
          </div>
        </PageHeader>

        <ExposureHeader
          blastRadius={blastRadius}
          isPending={isFastPending}
          isCheckingActivity={isCheckingActivity}
          onSimulateRotation={() => handlePopUpOpen("rotationSimulation")}
        />

        {blastRadius && <HealthyStateNote blastRadius={blastRadius} />}

        {blastRadius && viewMode === ViewMode.Graph && (
          <BlastRadiusFilters filters={filters} onChange={setFilters} />
        )}

        {blastRadius && (
          <TruncationBanner
            truncated={blastRadius.truncated.principals}
            onDrawMore={() => setPrincipalLimit((limit) => limit + PRINCIPAL_PAGE_SIZE)}
            onOpenTable={() => setViewMode(ViewMode.Table)}
          />
        )}

        {isFastPending && <Skeleton className="min-h-[34rem] flex-1" />}

        {!isFastPending && blastRadius && viewMode === ViewMode.Graph && (
          <div className="flex min-h-[34rem] flex-1 flex-col overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-3 gap-4 border-b border-border bg-container px-4 py-2 text-xs tracking-wide text-muted uppercase">
              <span>
                Entitled to read
                <span className="ml-1.5 text-foreground/75">
                  {blastRadius.truncated.principals.total}
                </span>
              </span>
              <span className="text-center">Secret</span>
              <span className="text-right">
                Destinations
                <span className="ml-1.5 text-foreground/75">{blastRadius.destinations.length}</span>
              </span>
            </div>
            <BlastRadiusGraph
              blastRadius={blastRadius}
              isCheckingActivity={isCheckingActivity}
              clusterUnusedAccess={filters.clusterUnusedAccess}
              hideHealthyDestinations={filters.syncStatus === SyncStatusFilter.Unhealthy}
              selectedPrincipalId={
                selectedPrincipal ? principalNodeId(selectedPrincipal) : undefined
              }
              onSelectPrincipal={setSelectedPrincipal}
              onExpandCluster={() =>
                setFilters((current) => ({ ...current, clusterUnusedAccess: false }))
              }
            />
          </div>
        )}

        {!isFastPending && blastRadius && viewMode === ViewMode.Table && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BlastRadiusTable blastRadius={blastRadius} onSelectPrincipal={setSelectedPrincipal} />
          </div>
        )}

        {!isFastPending && !blastRadius && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nothing to show</EmptyTitle>
              <EmptyDescription>
                This secret could not be resolved at {search.secretPath} in {search.environment}.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <ExplainPanel
          principal={selectedPrincipal}
          windowDays={blastRadius?.window.effectiveDays ?? 30}
          consumptionAvailable={blastRadius?.window.consumptionAvailable ?? false}
          auditLogHref={auditLogHref}
          accessHref={accessHref}
          roleHref={roleHref}
          onClose={() => setSelectedPrincipal(undefined)}
        />

        <RotationSimulationModal
          isOpen={popUp.rotationSimulation.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("rotationSimulation", isOpen)}
          simulation={simulation}
          isPending={isSimulationPending}
        />

        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Blast radius can be unlocked if you upgrade to Infisical Pro."
        />
      </div>
    );
  },
  {
    action: ProjectPermissionSecretActions.DescribeSecret,
    subject: ProjectPermissionSub.Secrets
  }
);
