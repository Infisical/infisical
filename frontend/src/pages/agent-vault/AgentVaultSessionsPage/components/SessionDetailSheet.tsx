import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { BotIcon, PackageIcon, UserIcon } from "lucide-react";

import {
  Detail,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { ActivityTab } from "./ActivityTab";
import { SessionStatusBadge } from "./SessionStatusBadge";

type Props = {
  session: TAgentVaultSession | undefined;
  isPending?: boolean;
};

export const SessionDetailSheet = ({ session, isPending = false }: Props) => {
  const { isOpen, closeSheet } = useAgentVaultSheetState();
  const { currentOrg } = useOrganization();

  const expiry = session?.expiresAt ? new Date(session.expiresAt) : null;
  let expiryDetail = "Never expires";
  if (expiry) {
    const hasPassed = expiry.getTime() <= Date.now();
    const relative = formatDistanceToNowStrict(expiry, { addSuffix: hasPassed });
    expiryDetail = `${hasPassed ? "Expired" : "Expires"} ${format(
      expiry,
      "MMM d, yyyy h:mm a"
    )} (${hasPassed ? "" : "in "}${relative})`;
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent
        className="flex h-full max-h-full w-full flex-col gap-y-0 sm:max-w-8xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {!session && isPending && (
          <Empty className="m-4 border">
            <EmptyHeader>
              <Spinner size="sm" />
            </EmptyHeader>
          </Empty>
        )}
        {!session && !isPending && (
          <Empty className="m-4 border">
            <EmptyHeader>
              <EmptyTitle>Session not found</EmptyTitle>
              <EmptyDescription>
                This session doesn&apos;t exist, or you don&apos;t have access to it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {session && (
          <>
            <SheetHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <SheetTitle>Activity Logs</SheetTitle>
                <SheetDescription>
                  Every request the agent made during this session.
                </SheetDescription>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    {session.identityId ? (
                      <BotIcon className="size-4 shrink-0 text-muted" />
                    ) : (
                      <UserIcon className="size-4 shrink-0 text-muted" />
                    )}
                    <span className="flex flex-col">
                      {session.actorName}
                      <span className="text-xs text-muted">
                        {session.identityId ? "Machine identity" : session.actorEmail}
                      </span>
                    </span>
                  </div>
                  {session.accessBundles.map((bundle) => {
                    const body = (
                      <>
                        <PackageIcon className="size-4 shrink-0 text-muted" />
                        <span className="flex flex-col">
                          <span className="group-hover:underline group-hover:underline-offset-2">
                            {bundle.name}
                            {!bundle.id && " (deleted)"}
                          </span>
                          <span className="text-xs text-muted">
                            {bundle.description || "No description"}
                          </span>
                        </span>
                      </>
                    );

                    return bundle.id ? (
                      <Link
                        key={bundle.id}
                        to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                        params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
                        className="group flex w-fit items-center gap-2 text-sm text-foreground"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div key={bundle.name} className="flex items-center gap-2 text-sm text-muted">
                        {body}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col items-end gap-3">
                  {session.status === AgentVaultSessionStatus.Revoked ? (
                    <SessionStatusBadge status={session.status} />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <SessionStatusBadge status={session.status} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{expiryDetail}</TooltipContent>
                    </Tooltip>
                  )}
                  <Detail className="items-end">
                    <DetailLabel>Created</DetailLabel>
                    <DetailValue>
                      {format(new Date(session.createdAt), "MMM d, yyyy h:mm a")}
                    </DetailValue>
                  </Detail>
                </div>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 p-4">
              <ActivityTab session={session} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
