import { useState } from "react";
import { Eye, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import {
  PamResourcePermissionActions,
  TPamFolderWithCount,
  usePamFolderActions
} from "@app/hooks/api/pam";

type Props = {
  folder: TPamFolderWithCount;
  onDetails: () => void;
  onConfigure: () => void;
  onAddAccount: () => void;
  onDelete: () => void;
};

export const FolderActionsMenu = ({
  folder,
  onDetails,
  onConfigure,
  onAddAccount,
  onDelete
}: Props) => {
  // Defer the permission fetch until the menu is first opened to avoid a request per row
  const [hasOpened, setHasOpened] = useState(false);
  const { can, isLoading } = usePamFolderActions(folder.id, hasOpened);

  const canRead = can(PamResourcePermissionActions.ReadFolder);
  const canEdit = can(PamResourcePermissionActions.EditFolder);
  const canCreateAccounts = can(PamResourcePermissionActions.CreateAccounts);
  const canDelete = can(PamResourcePermissionActions.DeleteFolder);
  const hasAnyAction = canRead || canEdit || canCreateAccounts || canDelete;

  return (
    <DropdownMenu onOpenChange={(open) => open && setHasOpened(true)}>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Folder actions"
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
            Details
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onClick={onConfigure}>
            <Settings />
            Configure
          </DropdownMenuItem>
        )}
        {canCreateAccounts && (
          <DropdownMenuItem onClick={onAddAccount}>
            <Plus />
            Add Account
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              <Trash2 />
              Delete Folder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
