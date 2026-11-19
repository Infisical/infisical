import { ReactNode, useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  FolderIcon,
  SearchIcon,
  SearchXIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  TBadgeProps
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TOrgProjectInsightWarnings, TOrgProjectsInsights } from "@app/hooks/api";

const COLLAPSED_ROW_COUNT = 4;

type EmptyState = {
  icon: ReactNode;
  title: string;
  description: string;
  mediaClassName?: string;
};

enum InsightsView {
  NeedsAttention = "needs-attention",
  AllProjects = "all-projects"
}

const projectInsightsRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/insights" as const;

const pluralize = (count: number, noun: string, plural = `${noun}s`) =>
  `${count.toLocaleString()} ${count === 1 ? noun : plural}`;

const WARNING_CHIPS: {
  key: keyof TOrgProjectInsightWarnings;
  variant: TBadgeProps["variant"];
  label: (count: number) => string;
}[] = [
  { key: "failedRotations", variant: "danger", label: (c) => pluralize(c, "Failed rotation") },
  { key: "failedSyncs", variant: "warning", label: (c) => pluralize(c, "Failed sync") },
  { key: "orphanedLeases", variant: "danger", label: (c) => pluralize(c, "Orphaned lease") },
  { key: "duplicatedSecrets", variant: "neutral", label: (c) => `${c.toLocaleString()} Duplicated` }
];

const WarningBadges = ({ warnings }: { warnings: TOrgProjectInsightWarnings }) => (
  <div className="flex flex-wrap gap-1">
    {WARNING_CHIPS.map(({ key, variant, label }) => {
      const count = warnings[key];
      // null means unknown (not zero) — omit the chip rather than claiming a count
      if (!count) return null;
      return (
        <Badge key={key} variant={variant}>
          {label(count)}
        </Badge>
      );
    })}
  </div>
);

export const InsightsCard = ({
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
  const { currentOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<InsightsView>(InsightsView.NeedsAttention);

  const sortedProjects = useMemo(
    () =>
      [...data.projects].sort(
        (a, b) => b.severityScore - a.severityScore || a.projectName.localeCompare(b.projectName)
      ),
    [data.projects]
  );

  const isHealthy = data.projectsWithIssues === 0;

  const modeProjects = useMemo(
    () =>
      view === InsightsView.NeedsAttention
        ? sortedProjects.filter((project) => project.severityScore > 0)
        : sortedProjects,
    [sortedProjects, view]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return modeProjects;
    return modeProjects.filter(
      (project) =>
        project.projectName.toLowerCase().includes(query) ||
        project.projectSlug.toLowerCase().includes(query)
    );
  }, [modeProjects, search]);

  const isSearching = search.trim().length > 0;
  const visible = showAll || isSearching ? filtered : filtered.slice(0, COLLAPSED_ROW_COUNT);

  const getDescription = () => {
    if (isHealthy) return "No projects have outstanding issues right now.";
    return `${data.projectsWithIssues} of ${data.totalProjects} projects have outstanding issues, ordered by severity.`;
  };

  const getEmptyState = (): EmptyState => {
    if (isSearching) {
      return {
        icon: <SearchXIcon />,
        title: "No projects match your search",
        description: `No project name or slug matches "${search.trim()}".`
      };
    }

    if (data.totalProjects === 0) {
      return {
        icon: <FolderIcon />,
        title: "No secrets management projects",
        description: "Create a secrets management project to see its insights here."
      };
    }

    return {
      icon: <CheckIcon />,
      title: "All projects are healthy",
      description: `No failed rotations, failed syncs, stale or duplicated secrets across your ${pluralize(
        data.totalProjects,
        "project"
      )}. New issues will appear here as they are detected.`,
      mediaClassName: "rounded-full"
    };
  };

  const emptyState = filtered.length === 0 ? getEmptyState() : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Insights</CardTitle>
        <CardDescription>{getDescription()}</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(next) => setView(next as InsightsView)}>
            <TabsList variant="filled">
              <TabsTrigger value={InsightsView.NeedsAttention}>Needs Attention</TabsTrigger>
              <TabsTrigger value={InsightsView.AllProjects}>All Projects</TabsTrigger>
            </TabsList>
          </Tabs>
          <InputGroup className="w-64">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* the framed Empty ships a hover tint for interactive drop targets; this one is static */}
        {emptyState && (
          <Empty frame="dashed" className="hover:bg-container">
            <EmptyHeader>
              <EmptyMedia variant="icon" className={emptyState.mediaClassName}>
                {emptyState.icon}
              </EmptyMedia>
              <EmptyTitle>{emptyState.title}</EmptyTitle>
              <EmptyDescription>{emptyState.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="text-right">Stale Secrets</TableHead>
                <TableHead className="text-right">Total Secrets</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((project) => (
                <TableRow key={project.projectId} linked>
                  <TableCell className="font-medium">
                    <RowLink
                      to={projectInsightsRoute}
                      params={{ orgId: currentOrg.id, projectId: project.projectId }}
                    >
                      {project.projectName}
                    </RowLink>
                  </TableCell>
                  <TableCell>
                    <WarningBadges warnings={project.warnings} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={project.warnings.staleSecrets > 0 ? "text-warning" : "text-muted"}
                    >
                      {project.warnings.staleSecrets.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {project.totalSecrets.toLocaleString()}
                  </TableCell>
                  <TableCell className="min-w-12 pr-1.5 text-end">
                    <ChevronRightIcon className="size-3.5 text-muted" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        {!isSearching && hasMore && (
          <Button
            variant="ghost"
            size="xs"
            isPending={isLoadingMore}
            onClick={() => {
              setShowAll(true);
              onLoadMore();
            }}
          >
            Show More Projects
            <ChevronDownIcon />
          </Button>
        )}
        {!isSearching && !hasMore && filtered.length > COLLAPSED_ROW_COUNT && (
          <Button variant="ghost" size="xs" onClick={() => setShowAll((prev) => !prev)}>
            {showAll ? "Show Fewer" : "Show More"}
            {showAll ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
