import { Link } from "@tanstack/react-router";
import { UsersIcon, XIcon } from "lucide-react";

import {
  Badge,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator
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
        <button
          type="button"
          aria-label={`Show the ${groups.length} ${groups.length === 1 ? "group" : "groups"} granting access`}
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
              <div className="flex shrink-0 items-center gap-1.5">
                {group.roles.map((role) => (
                  <Badge
                    key={`${group.id}-${role.roleId ?? role.role}`}
                    variant="neutral"
                    isTruncatable
                    className="max-w-[8rem]"
                  >
                    {getRoleName(role)}
                  </Badge>
                ))}
              </div>
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
