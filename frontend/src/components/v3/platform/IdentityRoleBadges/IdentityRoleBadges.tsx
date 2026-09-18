import { ClockAlertIcon, ClockIcon } from "lucide-react";

import { formatProjectRoleName } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { Badge } from "../../generic/Badge";
import { Popover, PopoverContent, PopoverTrigger } from "../../generic/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

// Minimal shape shared by the org search and project membership role payloads. Both tables feed
// their respective role objects in here, so keep this structural (don't reach for a domain type).
export type TIdentityRoleBadge = {
  id: string;
  role: string;
  customRoleName?: string | null;
  isTemporary?: boolean | null;
  temporaryAccessEndTime?: string | null;
};

type TIdentityRoleBadgesProps = {
  roles: TIdentityRoleBadge[];
  // Pills rendered inline before collapsing the rest into a "+N" popover.
  maxVisible?: number;
};

const DEFAULT_MAX_VISIBLE = 2;

const getRoleLabel = (role: TIdentityRoleBadge) =>
  formatProjectRoleName(role.role, role.customRoleName ?? undefined);

const isRoleExpired = (role: TIdentityRoleBadge) =>
  Boolean(role.isTemporary && role.temporaryAccessEndTime) &&
  new Date() > new Date(role.temporaryAccessEndTime as string);

const RoleBadge = ({ role, className }: { role: TIdentityRoleBadge; className?: string }) => {
  const expired = isRoleExpired(role);
  const label = getRoleLabel(role);
  const isCustom = role.role === ProjectMembershipRole.Custom;

  // Custom names can be arbitrarily long, so cap the width and truncate. A short built-in role
  // never needs the extra chrome, but a custom name (which the cap may clip) or a temporary role
  // (whose icon needs explaining) gets a tooltip revealing the full label + access status.
  const badge = (
    <Badge
      variant={expired ? "danger" : "neutral"}
      isTruncatable
      className={cn("max-w-[10rem]", className)}
    >
      <span className="capitalize">{label}</span>
      {role.isTemporary && (expired ? <ClockAlertIcon /> : <ClockIcon />)}
    </Badge>
  );

  if (!isCustom && !role.isTemporary) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5">
        <span className="capitalize">{label}</span>
        {role.isTemporary && (
          <span className="opacity-70">{expired ? "Access expired" : "Temporary access"}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export const IdentityRoleBadges = ({
  roles,
  maxVisible = DEFAULT_MAX_VISIBLE
}: TIdentityRoleBadgesProps) => {
  // Sort by displayed label so both tables show the same order regardless of how each endpoint
  // happens to return its (unordered) role rows.
  const sortedRoles = [...roles].sort((a, b) =>
    getRoleLabel(a).localeCompare(getRoleLabel(b), undefined, { sensitivity: "base" })
  );
  const visible = sortedRoles.slice(0, maxVisible);
  const overflow = sortedRoles.slice(maxVisible);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((role) => (
        <RoleBadge key={role.id} role={role} />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <Tooltip>
            <TooltipTrigger className="flex h-4 items-center">
              <PopoverTrigger asChild>
                <Badge variant="neutral" asChild>
                  <button type="button" onClick={(e) => e.stopPropagation()}>
                    +{overflow.length}
                  </button>
                </Badge>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Click to view additional roles</TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            className="flex w-auto max-w-sm flex-wrap gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {overflow.map((role) => (
              <RoleBadge key={role.id} role={role} className="z-10" />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
