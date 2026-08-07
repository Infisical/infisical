import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  SearchIcon
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
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TBadgeProps
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TOrgProjectInsightWarnings, TOrgProjectsInsights } from "@app/hooks/api";

const COLLAPSED_ROW_COUNT = 4;

const projectInsightsRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/insights" as const;

const pluralize = (count: number, noun: string, plural = `${noun}s`) =>
  `${count.toLocaleString()} ${count === 1 ? noun : plural}`;

const WARNING_CHIPS: {
  key: keyof TOrgProjectInsightWarnings;
  variant: TBadgeProps["variant"];
  label: (count: number) => string;
}[] = [
  { key: "failedRotations", variant: "danger", label: (c) => pluralize(c, "failed rotation") },
  { key: "failedSyncs", variant: "warning", label: (c) => pluralize(c, "failed sync") },
  { key: "staleSecrets", variant: "warning", label: (c) => pluralize(c, "stale secret") },
  { key: "orphanedLeases", variant: "warning", label: (c) => pluralize(c, "orphaned lease") },
  { key: "duplicatedSecrets", variant: "neutral", label: (c) => `${c.toLocaleString()} duplicated` }
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

const hasIssues = (warnings: TOrgProjectInsightWarnings) =>
  WARNING_CHIPS.some(({ key }) => (warnings[key] ?? 0) > 0);

export const NeedsAttentionCard = ({
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
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const issueProjects = useMemo(
    () =>
      data.projects
        .filter((project) => hasIssues(project.warnings))
        .sort((a, b) => b.severityScore - a.severityScore),
    [data.projects]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return issueProjects;
    return issueProjects.filter(
      (project) =>
        project.projectName.toLowerCase().includes(query) ||
        project.projectSlug.toLowerCase().includes(query)
    );
  }, [issueProjects, search]);

  const isSearching = search.trim().length > 0;
  const visible = showAll || isSearching ? filtered : filtered.slice(0, COLLAPSED_ROW_COUNT);
  const cleanCount = data.totalProjects - data.projectsWithIssues;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs Attention</CardTitle>
        <CardDescription>
          {data.projectsWithIssues} of {data.totalProjects} projects have outstanding issues,
          ordered by severity.
        </CardDescription>
        <CardAction>
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
        {issueProjects.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>All projects are healthy</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {issueProjects.length > 0 && filtered.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No projects match your search</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="text-right">Stale</TableHead>
                <TableHead className="text-right">Secrets</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((project) => (
                <TableRow
                  key={project.projectId}
                  onClick={() =>
                    navigate({
                      to: projectInsightsRoute,
                      params: { orgId: currentOrg.id, projectId: project.projectId }
                    })
                  }
                >
                  <TableCell className="font-medium">{project.projectName}</TableCell>
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
                  <TableCell>
                    <ChevronRightIcon className="size-3.5 text-muted" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <span className="flex items-center gap-2 text-sm text-success">
          <CheckIcon className="size-3.5" />
          {cleanCount.toLocaleString()} {cleanCount === 1 ? "project has" : "projects have"} no
          outstanding issues
        </span>
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
            {showAll ? "Show Fewer Projects" : "Show All Projects"}
            {showAll ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
