import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetPamTopActors } from "@app/hooks/api/pamInsights";

const sessionsRoute = "/organizations/$orgId/projects/pam/$projectId/sessions" as const;

export const PamTopActors = () => {
  const { currentOrg } = useOrganization();
  const { projectId } = useProject();
  const { data, isPending } = useGetPamTopActors({ projectId }, { enabled: !!projectId });
  const navigate = useNavigate();

  const totalSessions = data?.actors.reduce((sum, a) => sum + a.sessionCount, 0) ?? 0;
  const uniqueActors = data?.actors.length ?? 0;

  const renderBody = () => {
    if (isPending) return <Skeleton className="h-[280px] w-full" />;
    if (!data?.actors.length) {
      return (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>No session activity yet</EmptyTitle>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Actor</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.actors.map((actor, index) => (
            <TableRow
              key={`${actor.actorEmail}:${actor.actorName}`}
              className="[&>td]:h-auto [&>td]:py-2"
              onClick={() =>
                navigate({
                  to: sessionsRoute,
                  params: { orgId: currentOrg.id, projectId },
                  search: { search: actor.actorEmail || actor.actorName || undefined }
                })
              }
            >
              <TableCell className="text-muted">{index + 1}</TableCell>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span className="truncate" title={actor.actorName}>
                    {actor.actorName || actor.actorEmail || "Unknown"}
                  </span>
                  <span className="truncate text-xs text-muted" title={actor.actorEmail}>
                    {actor.isService ? "machine identity" : actor.actorEmail}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {actor.isService ? (
                  <Badge variant="info">identity</Badge>
                ) : (
                  <Badge variant="warning">user</Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {actor.sessionCount.toLocaleString()}
              </TableCell>
              <TableCell className="w-8 px-2">
                <ExternalLinkIcon className="size-3.5 text-muted" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Actors</CardTitle>
        <CardDescription>
          Users &amp; identities initiating the most PAM sessions over the past 30 days
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {renderBody()}
        {!isPending && uniqueActors > 0 && (
          <span className="text-xs text-muted">
            {uniqueActors} unique {uniqueActors === 1 ? "actor" : "actors"} &middot;{" "}
            {totalSessions.toLocaleString()} total sessions in the last 30 days
          </span>
        )}
      </CardContent>
    </Card>
  );
};
