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
  { key: "failedRotations", tone: "bad", label: (count) => counted(count, "Failed Rotation") },
  { key: "failedSyncs", tone: "warn", label: (count) => counted(count, "Failed Sync") },
  { key: "orphanedLeases", tone: "bad", label: (count) => counted(count, "Orphaned Lease") },
  {
    key: "duplicatedSecrets",
    tone: "soft",
    label: (count) => `${count.toLocaleString()} Duplicated`
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

  const loadMore = () => {
    if (isSearching) return undefined;
    if (hasMore)
      return {
        label: "Show More Projects",
        loading: isLoadingMore,
        onClick: () => {
          setShowAll(true);
          onLoadMore();
        }
      };
    if (filtered.length <= COLLAPSED_ROW_COUNT) return undefined;
    return {
      label: showAll ? "Show Fewer" : "Show More",
      onClick: () => setShowAll((current) => !current)
    };
  };

  const empty = () => {
    if (isSearching)
      return (
        <EmptyState
          size="sm"
          icon="search"
          title="No projects match your search"
          description={`No project name or slug matches "${search.trim()}".`}
        />
      );
    if (data.totalProjects === 0)
      return (
        <EmptyState
          size="sm"
          icon="folder"
          title="No secrets management projects"
          description="Create a secrets management project to see its insights here."
        />
      );
    return (
      <EmptyState
        size="sm"
        icon="check-c"
        title="All projects are healthy"
        description={`No failed rotations, failed syncs, stale or duplicated secrets across your ${counted(
          data.totalProjects,
          "project"
        )}. New issues appear here as they are detected.`}
      />
    );
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
      header: "Stale Secrets",
      align: "end",
      width: 140,
      render: (project) =>
        project.warnings.staleSecrets > 0 ? (
          <StatusText tone="warn">{project.warnings.staleSecrets.toLocaleString()}</StatusText>
        ) : (
          <StatusText>0</StatusText>
        )
    },
    {
      id: "total",
      header: "Total Secrets",
      align: "end",
      width: 140,
      render: (project) => project.totalSecrets.toLocaleString()
    }
  ];

  return (
    <Card
      variant="framed"
      title="Insights"
      action={
        <Inline gap={8} wrap={false}>
          <Tabs
            variant="segmented"
            label="Projects shown"
            value={view}
            onValueChange={setView}
            tabs={[
              { value: NEEDS_ATTENTION, label: "Needs Attention" },
              { value: ALL_PROJECTS, label: "All Projects" }
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
        loadMore={loadMore()}
        persistentStatus={
          data.projectsWithIssues > 0
            ? `${data.projectsWithIssues.toLocaleString()} of ${counted(data.totalProjects, "project")} have outstanding issues, ordered by severity.`
            : undefined
        }
      />
    </Card>
  );
};
