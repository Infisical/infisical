import { format } from "date-fns";
import { BotIcon, UserIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { AgentVaultSheetTab, useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { ActivityTab } from "./ActivityTab";
import { SessionStatusBadge } from "./SessionStatusBadge";

type Props = {
  session: TAgentVaultSession | undefined;
  isPending?: boolean;
};

export const SessionDetailSheet = ({ session, isPending = false }: Props) => {
  const { isOpen, tab, setTab, closeSheet } = useAgentVaultSheetState();

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent className="w-full !max-w-5xl overflow-y-auto">
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
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {session.identityId ? (
                  <BotIcon className="size-4 text-muted" />
                ) : (
                  <UserIcon className="size-4 text-muted" />
                )}
                {session.actorName}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <SessionStatusBadge status={session.status} />
                <span>{session.accessBundles.map((bundle) => bundle.name).join(", ")}</span>
                <span>
                  {session.expiresAt
                    ? `Expires ${format(new Date(session.expiresAt), "MMM d, yyyy h:mm a")}`
                    : "Never expires"}
                </span>
              </SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={setTab} className="px-4 pb-4">
              <TabsList variant="av">
                <TabsTrigger value={AgentVaultSheetTab.Activity}>Activity</TabsTrigger>
              </TabsList>
              <TabsContent value={AgentVaultSheetTab.Activity}>
                <ActivityTab session={session} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
