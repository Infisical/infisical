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
      {/* sm:, not an important override: SheetContent's own cap is `sm:max-w-md`, and matching the
          variant is what lets tailwind-merge replace it. Tailwind 4 takes important as a suffix, so
          the `!max-w-*` form generates no rule at all and silently leaves the 28rem default. */}
      <SheetContent
        className="flex h-full max-h-full w-full flex-col gap-y-0 sm:max-w-8xl"
        // Nothing here is waiting for typing: the sheet is opened to read, and the search would
        // otherwise take the caret and put a focus ring on the first thing the viewer sees.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {!session && isPending && (
          <Empty className="m-4 border">
            <EmptyHeader>
              <Spinner size="sm" />
            </EmptyHeader>
          </Empty>
        )}
        {/* A link to a session nobody can resolve says the same thing whether it never existed or
            belongs to someone else, which is what the endpoint does too. */}
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
            {/* Every field spelled out. The row has column headers to lean on and hides the rest
                behind tooltips; here there is room to label each one and show it in full. */}
            <SheetHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <SheetTitle>Activity Logs</SheetTitle>
                <SheetDescription>
                  Every request the agent made during this session.
                </SheetDescription>
              </div>
              {/* The identity and the bundle are the same shape — an icon and a name — so they read
                  as the same kind of thing. */}
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

                    // The icon and the description belong to the bundle as much as its name does,
                    // so the whole block is the link rather than the name alone.
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
                  {/* The badge already says whether the session still works; when it stops is the
                      one thing it leaves out, so that is what the hover answers. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <SessionStatusBadge status={session.status} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{expiryDetail}</TooltipContent>
                  </Tooltip>
                  <Detail className="items-end">
                    <DetailLabel>Created</DetailLabel>
                    <DetailValue>
                      {format(new Date(session.createdAt), "MMM d, yyyy h:mm a")}
                    </DetailValue>
                  </Detail>
                </div>
              </div>
            </SheetHeader>

            {/* p-4 to match the header's own padding: the tab strip used to provide this gap, and
                without it the summary sits flush against the header's bottom border. */}
            <div className="min-h-0 flex-1 p-4">
              <ActivityTab session={session} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
