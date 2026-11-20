import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { HeaderSearch } from "@infisical/cipher/ui/header-search";
import { Inline } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { StatusText } from "@infisical/cipher/ui/text";

import type {
  TOrgProjectInsight,
  TOrgProjectInsightWarnings,
  TOrgProjectsInsights
} from "@app/hooks/api/secretInsights/types";

import { useOrgId } from "../../../access/permissions";
import { v4Path } from "../../../links";

const COLLAPSED_ROW_COUNT = 4;
const NEEDS_ATTENTION = "needs-attention";
const ALL_PROJECTS = "all-projects";

const projectInsights = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/insights"
);

const counted = (count: number, noun: string) =>
  `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`;

const WARNING_BADGES: {
  key: keyof TOrgProjectInsightWarnings;
  tone: BadgeTone;
  label: (count: number) => string;
}[] = [
  { key: "failedRotations", tone: "bad", label: (count) => counted(count, "failed rotation") },
  { key: "failedSyncs", tone: "warn", label: (count) => counted(count, "failed sync") },
  { key: "orphanedLeases", tone: "bad", label: (count) => counted(count, "orphaned lease") },
  {
    key: "duplicatedSecrets",
    tone: "soft",
    label: (count) => `${count.toLocaleString()} duplicated`
  }
];

const WarningBadges = ({ warnings }: { warnings: TOrgProjectInsightWarnings }) => (
  <Inline gap={4}>
    {WARNING_BADGES.map(({ key, tone, label }) => {
      const count = warnings[key];
      // null means unknown rather than zero, so it gets no badge instead of claiming a count.
      if (!count) return null;
      return (
        <Badge key={key} tone={tone}>
          {label(count)}
        </Badge>
      );
    })}
  </Inline>
);

export const ProjectsInsightsCard = ({
  data,
  hasMore,
  onLoadMore,
  isLoadingMore
}: {
  data: TOrgProjectsInsights;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}) => {
  const orgId = useOrgId();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState(NEEDS_ATTENTION);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...data.projects]
      .sort(
        (a, b) => b.severityScore - a.severityScore || a.projectName.localeCompare(b.projectName)
      )
      .filter((project) => view === ALL_PROJECTS || project.severityScore > 0)
      .filter(
        (project) =>
          !query ||
          project.projectName.toLowerCase().includes(query) ||
          project.projectSlug.toLowerCase().includes(query)
      );
  }, [data.projects, search, view]);

  const isSearching = search.trim().length > 0;
  const rows = showAll || isSearching ? filtered : filtered.slice(0, COLLAPSED_ROW_COUNT);

  const paged = !isSearching && (hasMore || filtered.length > COLLAPSED_ROW_COUNT);
  const canShowMore = paged && (hasMore || !showAll);

  const empty = () => {
    if (isSearching)
      return <EmptyState size="sm" icon="search" title="No projects match your search" />;
    if (data.totalProjects === 0)
      return <EmptyState size="sm" icon="folder" title="No secrets management projects" />;
    return <EmptyState size="sm" icon="check-c" title="All projects are healthy" />;
  };

  const columns: DataTableColumn<TOrgProjectInsight>[] = [
    {
      id: "project",
      header: "Project",
      primary: true,
      grow: true,
      minWidth: 240,
      text: (project) => project.projectName,
      render: (project) => (
        <RowLink
          chevron
          link={{ to: projectInsights, params: { orgId, projectId: project.projectId } }}
        >
          {project.projectName}
        </RowLink>
      )
    },
    {
      id: "issues",
      header: "Issues",
      wrap: true,
      grow: true,
      minWidth: 360,
      render: (project) => <WarningBadges warnings={project.warnings} />
    },
    {
      id: "stale",
      header: "Stale secrets",
      align: "end",
      width: 140,
      render: (project) =>
        project.warnings.staleSecrets > 0 ? (
          <StatusText tone="warn">{project.warnings.staleSecrets.toLocaleString()}</StatusText>
        ) : (
          <StatusText>0</StatusText>
        )
    }
  ];

  return (
    <Card
      variant="framed"
      title="Projects"
      footerPlacement="frame"
      action={
        <Inline gap={8} wrap={false}>
          <Tabs
            variant="segmented"
            label="Projects shown"
            value={view}
            onValueChange={setView}
            tabs={[
              { value: NEEDS_ATTENTION, label: "Needs attention" },
              { value: ALL_PROJECTS, label: "All projects" }
            ]}
          />
          <HeaderSearch
            label="Search projects"
            placeholder="Search projects..."
            value={search}
            onValueChange={setSearch}
          />
        </Inline>
      }
    >
      <DataTable
        label="Projects"
        rows={rows}
        columns={columns}
        getRowId={(project) => project.projectId}
        rowLabel={(project) => project.projectName}
        empty={empty()}
        persistentStatus={
          paged
            ? `Showing ${rows.length.toLocaleString()} of ${filtered.length.toLocaleString()}${hasMore ? "+" : ""} projects`
            : undefined
        }
        loadMore={
          canShowMore
            ? {
                loading: isLoadingMore,
                onClick: () => {
                  setShowAll(true);
                  if (hasMore) onLoadMore();
                }
              }
            : undefined
        }
        showFewer={paged && showAll ? { onClick: () => setShowAll(false) } : undefined}
      />
    </Card>
  );
};
