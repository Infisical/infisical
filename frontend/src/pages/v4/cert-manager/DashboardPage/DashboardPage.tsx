import { useState } from "react";
import { Navigate, useParams } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@app/components/v4/ui/collapsible";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Heading } from "@app/components/v4/ui/text";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { certKeyAlgorithmToNameMap, isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
import type { TDashboardDistribution, TDashboardStats } from "@app/hooks/api/certificates/types";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { useCertManagerProjectId } from "../components/certificate";
import { AttentionList } from "./components/AttentionList";
import { CodeSigningSection } from "./components/CodeSigningSection";
import {
  type InventoryFilters,
  MAX_DONUT_SEGMENTS,
  otherColor,
  palette
} from "./components/dashboard.utils";
import { DonutCard, type DonutSlice } from "./components/DonutCard";
import { InventoryCard } from "./components/InventoryCard";
import { TrendCard } from "./components/TrendCard";
import { ValidityReadinessSection } from "./components/ValidityReadinessSection";

const foldTail = (
  data: TDashboardDistribution[],
  format: (label: string) => string,
  filtersOf: (entry: TDashboardDistribution) => InventoryFilters | undefined
): DonutSlice[] => {
  const sorted = data.filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count);
  const head =
    sorted.length <= MAX_DONUT_SEGMENTS ? sorted : sorted.slice(0, MAX_DONUT_SEGMENTS - 1);
  const tail = sorted.slice(head.length);
  const slices: DonutSlice[] = head.map((entry, index) => ({
    label: format(entry.label),
    count: entry.count,
    color: palette[index % palette.length],
    filters: filtersOf(entry)
  }));
  if (!tail.length) return slices;
  return [
    ...slices,
    {
      label: "Other",
      hint: `${tail.length} more`,
      count: tail.reduce((sum, entry) => sum + entry.count, 0),
      color: otherColor
    }
  ];
};

const algorithmName = (label: string) =>
  (certKeyAlgorithmToNameMap as Record<string, string>)[label] ?? label.replace(/_/g, " ");

const expirationSlices = (stats: TDashboardStats): DonutSlice[] => {
  const count = (buckets: string[]) =>
    stats.expirationBuckets
      .filter((entry) => buckets.includes(entry.bucket))
      .reduce((sum, entry) => sum + entry.count, 0);
  return [
    {
      label: "Under 7 days",
      count: count(["expired", "0-7d"]),
      color: "var(--v4-bad)",
      filters: { filterExpiresDays: "7" }
    },
    {
      label: "7 to 30 days",
      count: count(["8-30d"]),
      color: "var(--v4-warn)",
      filters: { filterExpiresAfterDays: "7", filterExpiresDays: "30" }
    },
    {
      label: "Over 30 days",
      count: count(["31-60d", "61-90d", "90d+"]),
      color: "var(--v4-ok)",
      filters: { filterExpiresAfterDays: "30" }
    }
  ];
};

const pqcSlices = (stats: TDashboardStats): DonutSlice[] => {
  const sum = (pqc: boolean) =>
    stats.distributions.byAlgorithm
      .filter((entry) => isPqcAlgorithm(entry.label) === pqc)
      .reduce((total, entry) => total + entry.count, 0);
  return [
    {
      label: "PQC-ready",
      count: sum(true),
      color: "var(--v4-ok)",
      filters: { viewId: "system-pqc" }
    },
    {
      label: "Classical",
      count: sum(false),
      color: "var(--chart-2)",
      filters: { viewId: "system-non-pqc" }
    }
  ];
};

export const DashboardPage = () => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/cert-manager/overview" });
  const adapter = useV4Adapter("certificates");
  const { projectId, isPending: isProjectPending } = useCertManagerProjectId(orgId);
  const id = projectId ?? "";
  const [trendRange, setTrendRange] = useState("30d");
  const [pqcTrendRange, setPqcTrendRange] = useState("30d");
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const access = adapter.useProjectPermission({ projectId: id });
  const { data: stats, isPending: isStatsPending } = adapter.useDashboardStats(id);
  const { data: trend } = adapter.useActivityTrend(id, trendRange);
  const { data: pqcTrend } = adapter.usePqcTrend(id, pqcTrendRange);

  if (isProjectPending || !projectId || access.isPending)
    return <Loader size="page" label="Loading dashboard" />;

  const isAdmin = access.data?.memberships.some((membership) =>
    membership.roles.some((role) => role.role === "admin")
  );
  if (!isAdmin)
    return (
      <Navigate
        replace
        to={v4Path("/organizations/$orgId/$")}
        params={{ orgId, _splat: "cert-manager/applications" }}
      />
    );

  const canRead = access.data?.permission.can(
    ProjectPermissionCertificateActions.Read,
    ProjectPermissionSub.Certificates
  );

  let body;
  if (!canRead)
    body = (
      <EmptyState
        icon="lock"
        title="You don't have access to certificates"
        description="Ask a project admin for permission to read certificates."
      />
    );
  else if (isStatsPending || !stats)
    body = (
      <Stack gap={32} role="status" aria-label="Loading certificate stats">
        <Skeleton height={56} />
        <Stack gap={16}>
          <Heading level={2}>Inventory health</Heading>
          <Grid gap={16} columns="1:2">
            <Skeleton height={256} />
            <Skeleton height={256} />
          </Grid>
        </Stack>
      </Stack>
    );
  else
    body = (
      <Stack gap={32}>
        <AttentionList stats={stats} />
        <Stack gap={16}>
          <Heading level={2}>Inventory health</Heading>
          <Grid gap={16} columns="1:2">
            <InventoryCard stats={stats} />
            <TrendCard
              title="Certificate activity"
              data={trend?.periods}
              range={trendRange}
              onRangeChange={setTrendRange}
              emptyTitle="No activity in this period"
              series={[
                { key: "issued", label: "Issued", color: "var(--chart-1)" },
                { key: "expired", label: "Expired", color: "var(--v4-bad)", dashed: true },
                { key: "revoked", label: "Revoked", color: "var(--chart-2)", dashed: true },
                { key: "renewed", label: "Renewed", color: "var(--v4-ok)" }
              ]}
            />
          </Grid>
        </Stack>
        <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
          <Stack gap={16}>
            <Inline gap={12} justify="between">
              <Heading level={2}>Breakdown</Heading>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  iconRight={isBreakdownOpen ? "chev-down" : "chev-right"}
                  aria-label={isBreakdownOpen ? "Hide breakdown" : "Show breakdown"}
                >
                  {isBreakdownOpen ? "Hide" : "Show"}
                </Button>
              </CollapsibleTrigger>
            </Inline>
            <CollapsibleContent>
              <Stack gap={32}>
                <Stack gap={16}>
                  <Heading level={3} size="subsection">
                    Distribution
                  </Heading>
                  <Grid gap={16} columns={2}>
                    <DonutCard
                      title="By enrollment method"
                      slices={foldTail(
                        stats.distributions.byEnrollmentMethod,
                        (label) => (label === "Other" ? label : label.toUpperCase()),
                        (entry) =>
                          entry.label === "Other"
                            ? undefined
                            : { filterEnrollmentType: entry.label }
                      )}
                    />
                    <DonutCard
                      title="By algorithm"
                      slices={foldTail(stats.distributions.byAlgorithm, algorithmName, (entry) =>
                        entry.label === "Unknown" ? undefined : { filterKeyAlgorithm: entry.label }
                      )}
                    />
                    <DonutCard
                      title="By issuing CA"
                      slices={foldTail(
                        stats.distributions.byCA,
                        (label) => label,
                        (entry) => (entry.id ? { filterCaId: entry.id } : undefined)
                      )}
                    />
                    <DonutCard
                      title="By time to expiry"
                      emptyTitle="No expiration data"
                      slices={expirationSlices(stats)}
                    />
                  </Grid>
                </Stack>
                <ValidityReadinessSection stats={stats} />
                {stats.totals.total > 0 && (
                  <Stack gap={16}>
                    <Heading level={3} size="subsection">
                      Post-quantum readiness
                    </Heading>
                    <Grid gap={16} columns={2}>
                      <DonutCard title="PQC readiness" slices={pqcSlices(stats)} />
                      <TrendCard
                        title="PQC adoption"
                        data={pqcTrend?.periods}
                        range={pqcTrendRange}
                        onRangeChange={setPqcTrendRange}
                        emptyTitle="No certificates issued in this period"
                        series={[
                          { key: "pqc", label: "PQC-ready", color: "var(--v4-ok)" },
                          {
                            key: "nonPqc",
                            label: "Classical",
                            color: "var(--chart-2)",
                            dashed: true
                          }
                        ]}
                      />
                    </Grid>
                  </Stack>
                )}
                <CodeSigningSection projectId={projectId} />
              </Stack>
            </CollapsibleContent>
          </Stack>
        </Collapsible>
      </Stack>
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Dashboard"
          description="Track certificate health, expiry, and compliance readiness."
        />
        {body}
      </Stack>
    </TooltipProvider>
  );
};
