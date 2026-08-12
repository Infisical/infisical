import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BotIcon, CircleSlashIcon, SearchIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
  Label,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { usePopUp } from "@app/hooks";
import { TAgentSession, useGetAgentSessions, useRevokeAgentSession } from "@app/hooks/api";

const LIVE_REFETCH_MS = 5000;

// A session with no request behind it yet has only ever been minted, which is worth distinguishing
// from one the proxy is actively resolving.
const describeLastUsed = (session: TAgentSession) =>
  session.lastUsedAt ? `${formatDistanceToNow(new Date(session.lastUsedAt))} ago` : "Never used";

const SessionStatus = ({ session }: { session: TAgentSession }) => {
  if (session.revokedAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Badge variant="danger">Revoked</Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Revoked {formatDateTime({ timestamp: session.revokedAt, timezone: Timezone.Local })}. The
          proxy drops it on its next policy refresh.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!session.isAgentEnabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Badge variant="warning">Agent disabled</Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          The machine identity is no longer marked as an agent, so this session no longer resolves.
        </TooltipContent>
      </Tooltip>
    );
  }

  return <Badge variant="success">Active</Badge>;
};

export const SessionsTab = () => {
  const { projectId } = useProject();
  const [search, setSearch] = useState("");
  const [isLive, setIsLive] = useState(true);

  const { data: sessions, isPending } = useGetAgentSessions(
    projectId,
    isLive ? LIVE_REFETCH_MS : undefined
  );
  const revokeSession = useRevokeAgentSession();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["revokeSession"] as const);

  const handleRevoke = async () => {
    const session = popUp.revokeSession.data as TAgentSession;
    try {
      await revokeSession.mutateAsync({ sessionId: session.id, projectId });
      handlePopUpToggle("revokeSession", false);
      createNotification({ type: "success", text: "Successfully revoked agent session" });
    } catch {
      // The shared mutation error handler surfaces the API error.
    }
  };

  const filtered = sessions?.filter((session) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${session.agentName} ${session.userEmail ?? ""} ${session.username}`
      .toLowerCase()
      .includes(term);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Which agent is acting for which person right now, and on which policies.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Switch
              id="agent-proxy-sessions-live"
              variant="success"
              size="sm"
              checked={isLive}
              onCheckedChange={setIsLive}
            />
            <Label htmlFor="agent-proxy-sessions-live">Live</Label>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <InputGroup className="mb-4">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by agent or person..."
          />
        </InputGroup>
        {!isPending && !filtered?.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {sessions?.length ? <SearchIcon /> : <BotIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {sessions?.length ? "No sessions match your search" : "No agent sessions yet"}
              </EmptyTitle>
              {!sessions?.length && (
                <EmptyDescription>
                  An agent starts a session when it begins acting for someone. Sessions do not
                  expire, so revoking one here is what ends it.
                </EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="min-w-[56rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">
                  <TableHeadLabel>Agent</TableHeadLabel>
                </TableHead>
                <TableHead>
                  <TableHeadLabel>Acting for</TableHeadLabel>
                </TableHead>
                <TableHead className="w-36">
                  <TableHeadLabel>Started</TableHeadLabel>
                </TableHead>
                <TableHead className="w-36">
                  <TableHeadLabel>Last request</TableHeadLabel>
                </TableHead>
                <TableHead className="w-36">
                  <TableHeadLabel>Status</TableHeadLabel>
                </TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                ["first", "second", "third"].map((row) => (
                  <TableRow key={`agent-session-skeleton-${row}`}>
                    {["agent", "user", "started", "used", "status", "actions"].map((cell) => (
                      <TableCell key={`agent-session-skeleton-${row}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {filtered?.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="truncate">{session.agentName}</TableCell>
                  <TableCell className="truncate">
                    {session.firstName || session.lastName ? (
                      <>
                        <p className="truncate text-sm text-foreground">
                          {[session.firstName, session.lastName].filter(Boolean).join(" ")}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {session.userEmail ?? session.username}
                        </p>
                      </>
                    ) : (
                      <span className="text-sm">{session.userEmail ?? session.username}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatDistanceToNow(new Date(session.createdAt))} ago</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatDateTime({
                          timestamp: session.createdAt,
                          timezone: Timezone.Local
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-muted">{describeLastUsed(session)}</TableCell>
                  <TableCell>
                    <SessionStatus session={session} />
                  </TableCell>
                  <TableCell className="w-28">
                    {!session.revokedAt && (
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Delete}
                        a={ProjectPermissionSub.AgentPolicies}
                      >
                        {(isAllowed: boolean) => (
                          <Button
                            variant="outline"
                            size="xs"
                            isDisabled={!isAllowed}
                            onClick={() => handlePopUpOpen("revokeSession", session)}
                          >
                            <CircleSlashIcon />
                            Revoke
                          </Button>
                        )}
                      </ProjectPermissionCan>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <AlertDialog
          open={popUp.revokeSession.isOpen}
          onOpenChange={(open) => handlePopUpToggle("revokeSession", open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Agent Session?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="text-foreground">
                  {(popUp.revokeSession.data as TAgentSession)?.agentName}
                </span>{" "}
                stops acting for{" "}
                <span className="text-foreground">
                  {(popUp.revokeSession.data as TAgentSession)?.userEmail ??
                    (popUp.revokeSession.data as TAgentSession)?.username}
                </span>
                . Its next request through the proxy is refused.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Alert variant="warning" appearance="borderless">
              <AlertDescription>
                The proxy caches resolved sessions, so this takes effect on its next policy refresh
                rather than instantly.
              </AlertDescription>
            </Alert>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={revokeSession.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={revokeSession.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  handleRevoke();
                }}
              >
                Revoke Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
