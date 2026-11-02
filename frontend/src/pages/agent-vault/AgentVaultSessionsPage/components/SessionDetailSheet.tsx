import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, BotIcon, PackageIcon, PencilIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { memberDisplayName, memberSubtitle } from "@app/components/agent-vault/MemberName";
import {
  Button,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { AgentVaultMemberType, AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { SessionExpiry } from "./SessionExpiry";
import { SessionLogsPanel } from "./SessionLogsPanel";
import { SessionStatusBadge } from "./SessionStatusBadge";

type Props = {
  session: TAgentVaultSession | undefined;
  isPending?: boolean;
  onRevoke: (session: TAgentVaultSession) => void;
  onEditLabel: (session: TAgentVaultSession) => void;
};

const MemberValue = ({
  name,
  subtitle,
  isDeleted
}: {
  name: string;
  subtitle?: string;
  isDeleted: boolean;
}) => (
  <DetailValue className={twMerge(isDeleted && "text-muted")}>
    <div>
      {name}
      {isDeleted && " (deleted)"}
    </div>
    {subtitle && subtitle !== name && <div className="text-xs text-muted">{subtitle}</div>}
  </DetailValue>
);

export const SessionDetailSheet = ({
  session,
  isPending = false,
  onRevoke,
  onEditLabel
}: Props) => {
  const { isOpen, closeSheet } = useAgentVaultSheetState();
  const { currentOrg } = useOrganization();

  const isOwnerDeleted = session?.actor.id === null;
  // The API refuses label edits once the owner, or the user it acts on behalf of, is deleted.
  const canEditLabel = !isOwnerDeleted && session?.onBehalfOf?.id !== null;
  const isActive = session?.status === AgentVaultSessionStatus.Active;
  const isMachineIdentity = session?.actor.type === AgentVaultMemberType.MachineIdentity;
  const hasExpired = Boolean(
    session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent
        size="workspace"
        // At the workspace default of three quarters, the sidebar would leave the logs table less
        // than its minimum width on most laptop screens.
        className="flex h-full max-h-full flex-col gap-y-0 sm:w-[90vw]"
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
          // The headers share the first grid row, so their bottom borders line up however tall either one is.
          <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]">
            <SheetHeader className="border-r">
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={twMerge(
                    "min-w-0 font-alliance font-normal wrap-anywhere text-foreground",
                    !session.label && "text-muted"
                  )}
                >
                  {session.label ?? "Unlabeled"}
                </h3>
                {canEditLabel && (
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label={session.label ? "Edit label" : "Add label"}
                    className="text-muted"
                    onClick={() => onEditLabel(session)}
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </div>
              <p className="flex items-start gap-1.5 text-sm text-accent">
                {isMachineIdentity ? (
                  <BotIcon className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <UserIcon className="mt-0.5 size-4 shrink-0" />
                )}
                <span className="min-w-0 wrap-anywhere">{memberDisplayName(session.actor)}</span>
              </p>
            </SheetHeader>

            {/* pr-12 keeps the button clear of the sheet's close button */}
            <SheetHeader className="flex-row items-start justify-between gap-4 pr-12">
              <div className="flex min-w-0 flex-col gap-1.5">
                <SheetTitle>Session Logs</SheetTitle>
                <SheetDescription>
                  Every request the agent made during this session.
                </SheetDescription>
              </div>
              {isActive && (
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
            </SheetHeader>

            <div className="flex min-h-0 flex-col border-r border-border">
              <DetailGroup className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4">
                <Detail className="items-start">
                  <DetailLabel>Status</DetailLabel>
                  <SessionStatusBadge status={session.status} />
                </Detail>
                <Detail>
                  <DetailLabel>{isMachineIdentity ? "Machine Identity" : "User"}</DetailLabel>
                  <MemberValue
                    name={memberDisplayName(session.actor)}
                    subtitle={isMachineIdentity ? undefined : memberSubtitle(session.actor)}
                    isDeleted={isOwnerDeleted}
                  />
                </Detail>
                {session.onBehalfOf && (
                  <Detail>
                    <DetailLabel>On Behalf Of</DetailLabel>
                    <MemberValue
                      name={memberDisplayName(session.onBehalfOf)}
                      subtitle={
                        session.onBehalfOf.id ? memberSubtitle(session.onBehalfOf) : undefined
                      }
                      isDeleted={!session.onBehalfOf.id}
                    />
                  </Detail>
                )}
                {session.accessBundles.length > 0 && (
                  <Detail>
                    <DetailLabel>
                      {session.accessBundles.length === 1 ? "Access Bundle" : "Access Bundles"}
                    </DetailLabel>
                    <DetailValue className="flex flex-col gap-1">
                      {session.accessBundles.map((bundle) =>
                        bundle.id ? (
                          <Link
                            key={bundle.id}
                            to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                            params={{ orgId: currentOrg.id, accessBundleId: bundle.id }}
                            className="group flex w-fit max-w-full items-start gap-2"
                          >
                            <PackageIcon className="mt-0.5 size-4 shrink-0 text-muted" />
                            <span className="min-w-0 group-hover:underline group-hover:underline-offset-2">
                              {bundle.name}
                            </span>
                          </Link>
                        ) : (
                          <span key={bundle.name} className="flex items-start gap-2 text-muted">
                            <PackageIcon className="mt-0.5 size-4 shrink-0" />
                            <span className="min-w-0">{bundle.name} (deleted)</span>
                          </span>
                        )
                      )}
                    </DetailValue>
                  </Detail>
                )}
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
              </DetailGroup>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col p-4">
              <SessionLogsPanel session={session} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
