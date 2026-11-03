import { ReactElement } from "react";
import { BotIcon, UserIcon } from "lucide-react";

import { memberDisplayName, memberSubtitle } from "@app/components/agent-vault/MemberName";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  AgentVaultMemberType,
  TAgentVaultSession,
  TAgentVaultSessionActor
} from "@app/hooks/api/agentVault";

const withTooltip = (trigger: ReactElement, content: string) => (
  <Tooltip>
    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
    <TooltipContent>{content}</TooltipContent>
  </Tooltip>
);

// Whichever of the two was deleted is the part that says so, so the row never reads as if the other one is gone.
const describe = (actor: TAgentVaultSessionActor) => {
  const name = memberDisplayName(actor);
  if (actor.id === null) return `"${name}" was deleted`;
  if (actor.type === AgentVaultMemberType.MachineIdentity) return `${actor.id} (machine identity)`;
  const subtitle = memberSubtitle(actor);
  return name === subtitle ? subtitle : `${name} (${subtitle})`;
};

export const SessionIdentity = ({ session }: { session: TAgentVaultSession }) => {
  const { actor, onBehalfOf } = session;
  const ActorIcon = actor.type === AgentVaultMemberType.MachineIdentity ? BotIcon : UserIcon;

  // Two lines tall even without the on-behalf-of line, so every row of the table is the same height.
  return (
    <div className="flex min-h-9 items-center">
      <div className="flex w-fit items-start gap-2">
        <ActorIcon className="mt-0.5 size-4 shrink-0 text-muted" />
        <div className="max-w-72 min-w-0">
          {withTooltip(
            <div className="w-fit max-w-full truncate">{memberDisplayName(actor)}</div>,
            actor.type === AgentVaultMemberType.User && actor.id !== null
              ? memberSubtitle(actor)
              : describe(actor)
          )}
          {onBehalfOf &&
            withTooltip(
              <div className="w-fit max-w-full truncate text-xs leading-4 text-muted">
                On behalf of {memberDisplayName(onBehalfOf)}
              </div>,
              describe(onBehalfOf)
            )}
        </div>
      </div>
    </div>
  );
};
