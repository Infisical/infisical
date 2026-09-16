import { format } from "date-fns";
import { BotIcon, UserIcon } from "lucide-react";

import {
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
};

export const SessionDetailSheet = ({ session }: Props) => {
  const { isOpen, tab, setTab, closeSheet } = useAgentVaultSheetState();

  return (
    <Sheet open={isOpen && Boolean(session)} onOpenChange={(open) => !open && closeSheet()}>
      <SheetContent className="w-full !max-w-5xl overflow-y-auto">
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
