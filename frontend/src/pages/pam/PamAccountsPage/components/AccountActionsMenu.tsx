import { useState } from "react";
import { Eye, MoreHorizontal, Settings, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import { PamResourcePermissionActions, usePamAccountActions } from "@app/hooks/api/pam";

type Props = {
  accountId: string;
  onDetails: () => void;
  onConfigure: () => void;
  onDelete: () => void;
};

export const AccountActionsMenu = ({ accountId, onDetails, onConfigure, onDelete }: Props) => {
  // Defer the permission fetch until the menu is first opened to avoid a request per row
  const [hasOpened, setHasOpened] = useState(false);
  const { can, isLoading } = usePamAccountActions(accountId, hasOpened);

  const canRead = can(PamResourcePermissionActions.ReadAccounts);
  const canEdit = can(PamResourcePermissionActions.EditAccounts);
  const canDelete = can(PamResourcePermissionActions.DeleteAccounts);
  const hasAnyAction = canRead || canEdit || canDelete;

  return (
    <DropdownMenu onOpenChange={(open) => open && setHasOpened(true)}>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Account actions"
          className="text-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isLoading && <DropdownMenuItem isDisabled>Checking access&hellip;</DropdownMenuItem>}
        {!isLoading && !hasAnyAction && (
          <DropdownMenuItem isDisabled>No actions available</DropdownMenuItem>
        )}
        {canRead && (
          <DropdownMenuItem onClick={onDetails}>
            <Eye />
            View Details
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={onConfigure}>
            <Settings />
            Configure
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              <Trash2 />
              Delete Account
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
