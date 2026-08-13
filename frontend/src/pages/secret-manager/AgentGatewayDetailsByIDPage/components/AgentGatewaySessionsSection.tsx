import { formatDistanceToNow } from "date-fns";
import { KeyRoundIcon, PlusIcon, RadioIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TAgentGateway,
  TAgentGatewaySession,
  useListAgentGatewaySessionRequests,
  useListAgentGatewaySessions,
  useUpdateAgentGateway
} from "@app/hooks/api/agentGateways";
import { TAgentGatewaySessionRequest } from "@app/hooks/api/agentGateways/types";

type Props = {
  agentGateway: TAgentGateway;
};

const DECISION_VARIANT: Record<string, "success" | "neutral" | "danger" | "warning" | "info"> = {
  brokered: "success",
  passthrough: "neutral",
  allowlisted: "info",
  blocked: "danger",
  canceled: "neutral",
  error: "danger"
};

// The decision and the status arrive as the wire enums ("brokered", "ended"), which are not labels. Every
// badge on this page displays them capitalised.
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// Everything a reader wants about a run, on one line: when, how it ran, and how much it did.
const sessionSubtitle = (session: TAgentGatewaySession) => {
  const parts = [
    formatDistanceToNow(new Date(session.createdAt), { addSuffix: true }),
    label(session.mode),
    session.requestCount === 1 ? "1 request" : `${session.requestCount} requests`
  ];
  return parts.join(" · ");
};

const credentialLabel = (credential: TAgentGatewaySessionRequest["credentials"][number]) => {
  if (credential.dynamicSecretName) {
    return credential.dynamicSecretField
      ? `${credential.dynamicSecretName}.${credential.dynamicSecretField}`
      : credential.dynamicSecretName;
  }
  return credential.key ?? "credential";
};

// A brokered request is the one a reviewer is looking for, so it is the only row that gets the accent, a
// left rule and the names of the credentials Infisical put on it. Everything else stays quiet.
const RequestRow = ({
  request,
  onAllowHost,
  isAllowingHost,
  isHostAllowed
}: {
  request: TAgentGatewaySessionRequest;
  onAllowHost: (host: string) => void;
  isAllowingHost: boolean;
  isHostAllowed: boolean;
}) => {
  const isBrokered = request.decision === "brokered";
  // Only offered where it changes something: a host already on the list needs no button, and once one is
  // added every other blocked row for the same host stops offering it too.
  const canAllow = request.decision === "blocked" && !isHostAllowed;

  return (
    <TableRow className={isBrokered ? "bg-project/5" : undefined}>
      <TableCell className="w-1 p-0">
        <div className={`h-full w-0.5 ${isBrokered ? "bg-project" : "bg-transparent"}`} />
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap text-mineshaft-400">
        {new Date(request.occurredAt).toLocaleTimeString()}
      </TableCell>
      <TableCell className="font-mono text-xs whitespace-nowrap text-mineshaft-200">
        {request.method}
      </TableCell>
      <TableCell className="min-w-0">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-xs text-mineshaft-100">{request.host}</span>
          {request.path && (
            <span className="truncate font-mono text-xs text-mineshaft-400">{request.path}</span>
          )}
        </span>
      </TableCell>
      <TableCell>
        {isBrokered && request.credentials.length ? (
          <span className="flex flex-wrap items-center gap-1">
            {request.credentials.map((credential) => (
              <Badge key={credentialLabel(credential)} variant="project">
                <KeyRoundIcon size={11} />
                {credentialLabel(credential)}
                {credential.header ? ` → ${credential.header}` : ""}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-xs text-mineshaft-500">&mdash;</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="flex items-center gap-x-2">
          <Badge variant={DECISION_VARIANT[request.decision] ?? "neutral"}>
            {label(request.decision)}
          </Badge>
          {/* The recording is where you discover what was blocked, so the fix belongs here rather than making
              somebody copy a hostname into a settings form. */}
          {canAllow && (
            <ProjectPermissionCan
              I={ProjectPermissionAgentGatewayActions.Edit}
              a={ProjectPermissionSub.AgentGateways}
            >
              {(isAllowed) => (
                <Button
                  variant="outline"
                  size="xs"
                  isDisabled={!isAllowed}
                  isPending={isAllowingHost}
                  onClick={() => onAllowHost(request.host)}
                >
                  <PlusIcon />
                  Allow
                </Button>
              )}
            </ProjectPermissionCan>
          )}
        </span>
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap text-mineshaft-300">
        {request.statusCode ?? "—"}
      </TableCell>
    </TableRow>
  );
};

export const AgentGatewaySessionsSection = ({ agentGateway }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["replaySession"] as const);
  const { data } = useListAgentGatewaySessions(agentGateway.id);
  const sessions = data?.sessions ?? [];

  const updateAgentGateway = useUpdateAgentGateway();
  const allowedHosts = new Set((agentGateway.allowedHosts ?? []).map((host) => host.toLowerCase()));

  // Adding the host the request was refused for turns the next attempt from blocked into allowlisted, which
  // is exactly what the reader is trying to achieve when they look at a blocked row.
  const onAllowHost = async (host: string) => {
    if (allowedHosts.has(host.toLowerCase())) return;

    try {
      await updateAgentGateway.mutateAsync({
        agentGatewayId: agentGateway.id,
        allowedHosts: [...allowedHosts, host.toLowerCase()]
      });
      createNotification({ text: `${host} is now allowed without a credential`, type: "success" });
    } catch {
      // The mutation cache surfaces the server's message.
    }
  };

  const selected = popUp.replaySession.data as TAgentGatewaySession | undefined;
  const { data: replay } = useListAgentGatewaySessionRequests(
    popUp.replaySession.isOpen ? selected?.id : undefined
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Every run brokered through this gateway, and the requests it made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sessions.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RadioIcon />
                </EmptyMedia>
                <EmptyTitle>No sessions yet</EmptyTitle>
                <EmptyDescription>
                  Run an agent through this gateway and its requests appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y divide-mineshaft-600 overflow-hidden rounded border border-mineshaft-600">
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  className="flex w-full cursor-pointer items-center gap-x-3 px-3 py-2 text-left hover:bg-mineshaft-700/40"
                  onClick={() => handlePopUpOpen("replaySession", session)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded bg-mineshaft-700 text-mineshaft-300">
                    <RadioIcon size={14} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-mineshaft-100">{session.actorName}</span>
                    <span className="truncate text-xs text-mineshaft-400">
                      {sessionSubtitle(session)}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-x-2">
                    {session.brokeredCount > 0 && (
                      <Badge variant="project">
                        <KeyRoundIcon size={11} />
                        {session.brokeredCount} Brokered
                      </Badge>
                    )}
                    <Badge variant={session.status === "active" ? "success" : "neutral"}>
                      {label(session.status)}
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={popUp.replaySession.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("replaySession", isOpen)}
      >
        <SheetContent className="sm:max-w-4xl!">
          <SheetHeader>
            <SheetTitle>Session Recording</SheetTitle>
            <p className="text-sm text-mineshaft-300">
              {selected
                ? `${selected.actorName} · ${label(selected.mode)} · started ${new Date(
                    selected.createdAt
                  ).toLocaleString()}`
                : ""}
            </p>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!replay?.requests.length ? (
              <p className="rounded border border-dashed border-mineshaft-600 px-3 py-6 text-center text-sm text-mineshaft-400">
                No requests recorded for this session yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded border border-mineshaft-600">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1 p-0" />
                      <TableHead>Time</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Request</TableHead>
                      <TableHead>Credential applied</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replay.requests.map((request) => (
                      <RequestRow
                        key={request.id}
                        request={request}
                        onAllowHost={onAllowHost}
                        isAllowingHost={updateAgentGateway.isPending}
                        isHostAllowed={allowedHosts.has(request.host.toLowerCase())}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
