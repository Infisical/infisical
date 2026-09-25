import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, BotIcon, PackageIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
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
  Spinner
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { ActivityTab } from "./ActivityTab";
import { SessionExpiry } from "./SessionExpiry";
import { SessionStatusBadge } from "./SessionStatusBadge";

type Props = {
  session: TAgentVaultSession | undefined;
  isPending?: boolean;
  onRevoke: (session: TAgentVaultSession) => void;
};

export const SessionDetailSheet = ({ session, isPending = false, onRevoke }: Props) => {
  const { isOpen, closeSheet } = useAgentVaultSheetState();
  const { currentOrg } = useOrganization();

  const isOwnerDeleted = Boolean(session && !session.userId && !session.identityId);
  // Deleting the owner nulls both ids, and only users are minted with an actorEmail
  const isMachineIdentity =
    Boolean(session?.identityId) || (isOwnerDeleted && !session?.actorEmail);
  const hasExpired = Boolean(
    session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()
  );

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
            <SheetHeader>
              <SheetTitle>Session Logs</SheetTitle>
              <SheetDescription>Every request the agent made during this session.</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <div className="flex shrink-0 items-center gap-4 overflow-hidden rounded-md border border-border bg-container py-3 pr-4">
                {/* -ml-px pushes each row's leading divider past the clipped edge, so a wrapped row doesn't start with one */}
                <div className="-ml-px flex min-w-0 flex-1 flex-wrap gap-y-3 *:border-l *:border-border *:px-4">
                  <Detail className="min-w-0">
                    <DetailLabel>{isMachineIdentity ? "Machine Identity" : "User"}</DetailLabel>
                    <DetailValue
                      className={twMerge("flex items-center gap-2", isOwnerDeleted && "text-muted")}
                    >
                      {isMachineIdentity ? (
                        <BotIcon className="size-4 shrink-0 text-muted" />
                      ) : (
                        <UserIcon className="size-4 shrink-0 text-muted" />
                      )}
                      <span className="truncate">
                        {session.actorName}
                        {isOwnerDeleted && " (deleted)"}
                      </span>
                      {!isMachineIdentity && (
                        <span className="truncate text-muted">{session.actorEmail}</span>
                      )}
                    </DetailValue>
                  </Detail>
                  <Detail className="min-w-0">
                    <DetailLabel>
                      {session.accessBundles.length === 1 ? "Access Bundle" : "Access Bundles"}
                    </DetailLabel>
                    <DetailValue className="flex flex-wrap gap-x-4 gap-y-1">
                      {session.accessBundles.map((bundle) =>
                        bundle.id ? (
                          <Link
                            key={bundle.id}
                            to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                            params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
                            className="group flex min-w-0 items-center gap-2"
                          >
                            <PackageIcon className="size-4 shrink-0 text-muted" />
                            <span className="truncate group-hover:underline group-hover:underline-offset-2">
                              {bundle.name}
                            </span>
                          </Link>
                        ) : (
                          <span
                            key={bundle.name}
                            className="flex min-w-0 items-center gap-2 text-muted"
                          >
                            <PackageIcon className="size-4 shrink-0" />
                            <span className="truncate">{bundle.name} (deleted)</span>
                          </span>
                        )
                      )}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Created</DetailLabel>
                    <DetailValue>
                      {format(new Date(session.createdAt), "MMM d, yyyy h:mm a")}
                    </DetailValue>
                  </Detail>
                  {session.revokedAt && (
                    <Detail>
                      <DetailLabel>Revoked</DetailLabel>
                      <DetailValue>
                        {format(new Date(session.revokedAt), "MMM d, yyyy h:mm a")}
                      </DetailValue>
                    </Detail>
                  )}
                  {session.status !== AgentVaultSessionStatus.Revoked && (
                    <Detail>
                      <DetailLabel>{hasExpired ? "Expired" : "Expires"}</DetailLabel>
                      <DetailValue>
                        <SessionExpiry expiresAt={session.expiresAt} />
                      </DetailValue>
                    </Detail>
                  )}
                  <Detail className="items-start">
                    <DetailLabel>Status</DetailLabel>
                    <SessionStatusBadge status={session.status} />
                  </Detail>
                </div>
                {session.status === AgentVaultSessionStatus.Active && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onRevoke(session)}
                  >
                    <BanIcon />
                    Revoke Session
                  </Button>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <ActivityTab session={session} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
