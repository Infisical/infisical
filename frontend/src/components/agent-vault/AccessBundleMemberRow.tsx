import { format } from "date-fns";
import { BanIcon, ChevronDownIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v3";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActor, TAgentVaultProductActor } from "@app/hooks/api/agentVault/types";

import { MEMBER_KIND, memberDisplayName, memberSubtitle } from "./MemberName";
import { PendingInvitationBadge } from "./PendingInvitationBadge";

const ROW_CLASS_NAME = "flex items-center gap-3 py-3";

const initialsOf = (value: string) =>
  value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const MemberIdentity = ({
  member,
  badge
}: {
  member: TAgentVaultActor;
  badge?: React.ReactNode;
}) => {
  const name = memberDisplayName(member);
  const { label, icon: Icon } = MEMBER_KIND[member.type];

  return (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral/10 text-xs font-semibold text-accent">
        {member.type === AgentVaultMemberType.User ? initialsOf(name) : <Icon className="size-4" />}
        <span className="sr-only">{label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {badge}
        </div>
        <p className="truncate text-xs text-muted">{memberSubtitle(member)}</p>
      </div>
    </>
  );
};

type MemberRowProps = {
  member: TAgentVaultActor & { grantedAt: string };
  isDisabled?: boolean;
  onRevoke: () => void;
};

export const AccessBundleMemberRow = ({ member, isDisabled, onRevoke }: MemberRowProps) => (
  <div className={ROW_CLASS_NAME}>
    <MemberIdentity member={member} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0" isDisabled={isDisabled}>
          Has Access
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          Granted {format(new Date(member.grantedAt), "MMM d, yyyy")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onClick={onRevoke}>
          <BanIcon />
          Revoke Access
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

type GrantRowProps = {
  member: TAgentVaultProductActor;
  isDisabled?: boolean;
  onGrant: () => void;
};

export const AccessBundleGrantRow = ({ member, isDisabled, onGrant }: GrantRowProps) => (
  <div className={ROW_CLASS_NAME}>
    <MemberIdentity
      member={member}
      badge={
        <PendingInvitationBadge
          isPending={member.type === AgentVaultMemberType.User && member.isOrgMembershipPending}
        />
      }
    />
    <Button variant="av" size="sm" className="shrink-0" isDisabled={isDisabled} onClick={onGrant}>
      Grant Access
    </Button>
  </div>
);
