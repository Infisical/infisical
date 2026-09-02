import { BotIcon, UserIcon, UsersIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";

// The API returns raw user fields, so the display rule lives here, matching how the PAM members
// table formats a name.
export const memberDisplayName = (member: TAgentVaultMember) => {
  if (member.group) return member.group.name;
  if (member.identity) return member.identity.name;
  if (!member.user) return "Unknown";

  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ");
  return fullName || member.user.username || member.user.email || "Unknown";
};

const memberKind = (member: TAgentVaultMember) => {
  if (member.groupId) return { label: "Group", icon: UsersIcon };
  if (member.identityId) return { label: "Machine Identity", icon: BotIcon };
  return { label: "User", icon: UserIcon };
};

export const MemberName = ({ member }: { member: TAgentVaultMember }) => {
  const { label, icon: Icon } = memberKind(member);

  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted" />
      <span>{memberDisplayName(member)}</span>
      <Badge variant="neutral">{label}</Badge>
    </div>
  );
};
