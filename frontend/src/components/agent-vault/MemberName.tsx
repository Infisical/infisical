import { BotIcon, UserIcon, UsersIcon } from "lucide-react";

import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActor, TAgentVaultMember } from "@app/hooks/api/agentVault/types";

export const MEMBER_KIND: Record<AgentVaultMemberType, { label: string; icon: typeof UserIcon }> = {
  [AgentVaultMemberType.User]: { label: "User", icon: UserIcon },
  [AgentVaultMemberType.MachineIdentity]: { label: "Machine Identity", icon: BotIcon },
  [AgentVaultMemberType.Group]: { label: "Group", icon: UsersIcon }
};

export const memberDisplayName = (actor: TAgentVaultActor) => {
  if (actor.type !== AgentVaultMemberType.User) return actor.name;

  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return fullName || actor.username || actor.email || "Unknown";
};

export const memberSubtitle = (actor: TAgentVaultActor) => {
  if (actor.type !== AgentVaultMemberType.User) return MEMBER_KIND[actor.type].label;
  return actor.email || actor.username;
};

export const MemberName = ({ member }: { member: TAgentVaultMember }) => {
  const { label, icon: Icon } = MEMBER_KIND[member.actor.type];

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="sr-only">{label}</span>
      <div className="min-w-0">
        <div className="truncate">{memberDisplayName(member.actor)}</div>
        <div className="truncate text-xs leading-4 text-muted">{memberSubtitle(member.actor)}</div>
      </div>
    </div>
  );
};
