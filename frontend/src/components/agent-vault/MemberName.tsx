import { BotIcon, UserIcon, UsersIcon } from "lucide-react";

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

// The email for a person, the kind for anything else: enough to tell two similar names apart,
// which is the job PAM's member rows give the second line.
const memberSubtitle = (member: TAgentVaultMember, kindLabel: string) => {
  if (member.user) return member.user.email || member.user.username;
  return kindLabel;
};

export const MemberName = ({ member }: { member: TAgentVaultMember }) => {
  const { label, icon: Icon } = memberKind(member);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="sr-only">{label}</span>
      <div className="min-w-0">
        <div className="truncate">{memberDisplayName(member)}</div>
        <div className="truncate text-xs leading-4 text-muted">{memberSubtitle(member, label)}</div>
      </div>
    </div>
  );
};
