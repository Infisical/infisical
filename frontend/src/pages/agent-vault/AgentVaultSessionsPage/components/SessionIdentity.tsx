import { ReactElement } from "react";
import { BotIcon, UserIcon } from "lucide-react";

import { memberDisplayName, memberSubtitle } from "@app/components/agent-vault/MemberName";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { AgentVaultMemberType, TAgentVaultSession } from "@app/hooks/api/agentVault";

// Deleting the machine identity or the user it acts for ends the session, so the cell names whichever was deleted.
const describeDeleted = ({ actor, onBehalfOf }: TAgentVaultSession) => {
  const names = [
    actor.id === null ? memberDisplayName(actor) : null,
    onBehalfOf && onBehalfOf.id === null ? memberDisplayName(onBehalfOf) : null
  ].filter((name): name is string => name !== null);
  if (!names.length) return null;
  return `${names.map((name) => `"${name}"`).join(" and ")} ${names.length === 1 ? "was" : "were"} deleted`;
};

export const SessionIdentity = ({ session }: { session: TAgentVaultSession }) => {
  const { actor, onBehalfOf } = session;

  if (actor.type === AgentVaultMemberType.User) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-fit items-center gap-2">
            <UserIcon className="size-4 text-muted" />
            {memberDisplayName(actor)}
          </div>
        </TooltipTrigger>
        <TooltipContent>{memberSubtitle(actor)}</TooltipContent>
      </Tooltip>
    );
  }

  const deleted = describeDeleted(session);
  const explained = (trigger: ReactElement) =>
    deleted ? (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent>{deleted}</TooltipContent>
      </Tooltip>
    ) : (
      trigger
    );

  return (
    <div className="flex w-fit items-center gap-2">
      <BotIcon className="size-4 text-muted" />
      {onBehalfOf ? memberDisplayName(actor) : explained(<span>{memberDisplayName(actor)}</span>)}
      {onBehalfOf &&
        explained(
          <Badge
            variant="neutral"
            iconPosition="left"
            isTruncatable
            className={deleted ? "max-w-60 text-muted" : "max-w-60"}
          >
            <UserIcon />
            <span>On Behalf Of {memberDisplayName(onBehalfOf)}</span>
          </Badge>
        )}
    </div>
  );
};
