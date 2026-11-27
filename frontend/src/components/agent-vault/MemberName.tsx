import { BotIcon, UserIcon, UsersIcon } from "lucide-react";

import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActor, TAgentVaultSessionActor } from "@app/hooks/api/agentVault/types";

export const MEMBER_KIND: Record<AgentVaultMemberType, { label: string; icon: typeof UserIcon }> = {
  [AgentVaultMemberType.User]: { label: "User", icon: UserIcon },
  [AgentVaultMemberType.MachineIdentity]: { label: "Machine Identity", icon: BotIcon },
  [AgentVaultMemberType.Group]: { label: "Group", icon: UsersIcon }
};

export const memberDisplayName = (actor: TAgentVaultActor | TAgentVaultSessionActor) => {
  if (actor.type !== AgentVaultMemberType.User) return actor.name;

  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return fullName || actor.username || actor.email || "Unknown";
};

export const memberSubtitle = (actor: TAgentVaultActor | TAgentVaultSessionActor) => {
  if (actor.type !== AgentVaultMemberType.User) return MEMBER_KIND[actor.type].label;
  return actor.email || actor.username;
};

export const MemberName = ({
  member,
  isSingleLine = false
}: {
  member: TAgentVaultActor;
  // The name alone, for dense rows; the icon and the screen-reader label still say what kind of member it is.
  isSingleLine?: boolean;
}) => {
  const { label, icon: Icon } = MEMBER_KIND[member.type];

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {/* One line tall, so the icon centers on the name's line at whatever text size the caller uses. */}
      <span className="flex h-[1lh] shrink-0 items-center">
        <Icon className="size-4 text-muted" />
      </span>
      <span className="sr-only">{label}</span>
      <div className="min-w-0">
        <div className="truncate">{memberDisplayName(member)}</div>
        {!isSingleLine && (
          <div className="truncate text-xs leading-4 text-muted">{memberSubtitle(member)}</div>
        )}
      </div>
    </div>
  );
};
