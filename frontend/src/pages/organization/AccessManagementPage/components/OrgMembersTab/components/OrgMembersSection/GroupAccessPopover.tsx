import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { UsersIcon, XIcon } from "lucide-react";

import {
  Badge,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TOrgUserAccessGroup, TOrgUserAccessGroupRole } from "@app/hooks/api/users/types";

type Props = {
  orgId: string;
  groups: TOrgUserAccessGroup[];
  hasDirectAccess: boolean;
  getRoleName: (role: TOrgUserAccessGroupRole) => string;
};

const MAX_VISIBLE_ROLES = 1;

const RoleBadge = ({ name }: { name: string }) => (
  <Badge variant="neutral" isTruncatable className="max-w-[8rem]">
    {name}
  </Badge>
);

const GroupRoleBadges = ({
  roles,
  getRoleName
}: {
  roles: TOrgUserAccessGroupRole[];
  getRoleName: (role: TOrgUserAccessGroupRole) => string;
}) => {
  const visible = roles.slice(0, MAX_VISIBLE_ROLES);
  const overflow = roles.slice(MAX_VISIBLE_ROLES);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {visible.map((role) => (
        <RoleBadge key={role.roleId ?? role.role} name={getRoleName(role)} />
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
              <RoleBadge key={role.roleId ?? role.role} name={getRoleName(role)} />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export const GroupAccessPopover = ({ orgId, groups, hasDirectAccess, getRoleName }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show groups granting access"
          className="-mx-1.5 flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-foreground transition-colors hover:bg-foreground/10 data-[state=open]:bg-foreground/10"
          onClick={(e) => e.stopPropagation()}
        >
          <UsersIcon className="size-4 text-muted" />
          <span className="underline decoration-muted underline-offset-2">{groups.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-80 flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Access Details</p>
          <IconButton
            variant="ghost-muted"
            size="2xs"
            aria-label="Close"
            onClick={() => setIsOpen(false)}
          >
            <XIcon />
          </IconButton>
        </div>
        <ul className="flex flex-col gap-2">
          {groups.map((group) => (
            <li key={group.id} className="flex items-center justify-between gap-3">
              <Link
                to="/organizations/$orgId/groups/$groupId"
                params={{ orgId, groupId: group.id }}
                className="flex min-w-0 items-center gap-1.5 text-sm text-foreground"
              >
                <UsersIcon className="size-4 shrink-0 text-muted" />
                <span className="truncate underline decoration-muted underline-offset-2 hover:decoration-foreground">
                  {group.name}
                </span>
              </Link>
              <GroupRoleBadges roles={group.roles} getRoleName={getRoleName} />
            </li>
          ))}
        </ul>
        {!hasDirectAccess && (
          <>
            <Separator />
            <p className="text-sm text-muted">Remove this user from the groups to revoke access.</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
