import { useState } from "react";
import { AlertCircleIcon, ServerIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetMySessions, useRevokeMySessionById } from "@app/hooks/api";
import { timeAgo } from "@app/lib/fn/date";
import { formatSessionUserAgent } from "@app/lib/fn/string";

const formatLocalDateTime = (date: Date): string => {
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

export const SessionsTable = () => {
  const { data, isPending, isError, refetch } = useGetMySessions();
  const { mutateAsync: revokeMySessionById, isPending: isRevoking } = useRevokeMySessionById();
  const [sessionToRevoke, setSessionToRevoke] = useState<{
    id: string;
    ip: string;
    browser: string;
  } | null>(null);

  const handleSignOut = async (sessionId: string) => {
    try {
      await revokeMySessionById(sessionId);
      createNotification({
        text: "Session signed out.",
        type: "success"
      });
      setSessionToRevoke(null);
    } catch {
      createNotification({
        text: "Failed to sign out session.",
        type: "error"
      });
    }
  };

  if (isError) {
    return (
      <Alert variant="danger">
        <AlertCircleIcon />
        <AlertTitle>Sessions could not be loaded</AlertTitle>
        <AlertDescription>
          <p>Check your connection and try again.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!isPending && data?.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>No active sessions</EmptyTitle>
          <EmptyDescription>
            Browser and CLI sessions will appear here after you sign in.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>IP and session ID</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Last accessed</TableHead>
            <TableHead className="w-px">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending &&
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={`session-skeleton-${index + 1}`}>
                {Array.from({ length: 4 }).map((__, cellIndex) => (
                  <TableCell key={`session-skeleton-cell-${cellIndex + 1}`}>
                    <Skeleton className="h-4 w-full max-w-36" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {data?.map(({ id, createdAt, lastUsed, ip, userAgent }) => {
            const { os, browser } = formatSessionUserAgent(userAgent);
            const lastUsedDate = new Date(lastUsed);
            const createdAtDate = new Date(createdAt);

            return (
              <TableRow key={`session-${id}`}>
                <TableCell className="h-auto py-2">
                  <div className="flex min-w-44 flex-col">
                    <span className="text-sm leading-5 font-medium">{ip || "Unknown IP"}</span>
                    <span
                      className="max-w-64 truncate font-mono text-xs leading-4 text-muted"
                      title={id}
                    >
                      {id}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2">
                  <div className="flex flex-col">
                    <span className="text-sm leading-5 font-medium">
                      {os || "Unknown operating system"}
                    </span>
                    <span className="text-xs leading-4 text-muted">
                      {browser || "Unknown browser"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2">
                  <div className="flex flex-col">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="w-fit cursor-help rounded-sm bg-transparent p-0 text-left text-sm leading-5 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <time dateTime={lastUsedDate.toISOString()}>
                            {timeAgo(lastUsedDate, new Date())}
                          </time>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{formatLocalDateTime(lastUsedDate)}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="w-fit cursor-help rounded-sm bg-transparent p-0 text-left text-xs leading-4 text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <time dateTime={createdAtDate.toISOString()}>
                            Created {timeAgo(createdAtDate, new Date())}
                          </time>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{formatLocalDateTime(createdAtDate)}</TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell className="h-auto py-2 text-right">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSessionToRevoke({ id, ip, browser })}
                  >
                    Sign out
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={sessionToRevoke !== null}
        onOpenChange={(open) => !open && !isRevoking && setSessionToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToRevoke
                ? `The ${sessionToRevoke.browser || "unknown browser"} session from ${
                    sessionToRevoke.ip || "an unknown IP"
                  } will lose access to your account.`
                : "This session will lose access to your account."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              isPending={isRevoking}
              onClick={(event) => {
                event.preventDefault();
                if (sessionToRevoke) handleSignOut(sessionToRevoke.id);
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
