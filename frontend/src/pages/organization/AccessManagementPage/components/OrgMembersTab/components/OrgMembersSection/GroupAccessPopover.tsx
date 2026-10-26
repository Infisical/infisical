import { Link } from "@tanstack/react-router";
import { UsersIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
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
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  keepFocusOnClose: boolean;
};

const MAX_VISIBLE_ROLES = 1;

const RoleBadge = ({ name }: { name: string }) => (
  <Badge variant="neutral" isTruncatable className="max-w-[8rem]">
    <span>{name}</span>
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
            <TooltipTrigger asChild>
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
            className="flex max-h-(--radix-popover-content-available-height) w-auto max-w-sm flex-wrap gap-1.5 overflow-y-auto"
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

// Open state lives in the table so opening one row's popover closes any other.
export const GroupAccessPopover = ({
  orgId,
  groups,
  hasDirectAccess,
  getRoleName,
  isOpen,
  onOpenChange,
  keepFocusOnClose
}: Props) => {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Show groups granting access"
          className="relative z-10 -mx-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <UsersIcon className="text-muted" />
          <span className="underline decoration-muted underline-offset-2">{groups.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-(--radix-popover-content-available-height) w-80 flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          if (keepFocusOnClose) e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Access Details</p>
          <IconButton
            variant="ghost-muted"
            size="2xs"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <XIcon />
          </IconButton>
        </div>
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
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
