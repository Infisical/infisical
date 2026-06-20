import { useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";

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
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PAM_FOLDER_TABS, visiblePamTabs } from "../../components/pamResourceTabs";

type Props = {
  folder: TPamFolderWithCount;
  onOpenTab: (tab: PamSheetTab) => void;
  onAddAccount: () => void;
  onDelete: () => void;
};

export const FolderActionsMenu = ({ folder, onOpenTab, onAddAccount, onDelete }: Props) => {
  // Defer the permission fetch until the menu is first opened to avoid a request per row
  const [hasOpened, setHasOpened] = useState(false);
  const { can, isLoading } = usePamFolderActions(folder.id, hasOpened);

  const tabs = visiblePamTabs(PAM_FOLDER_TABS, can);
  const canCreateAccounts = can(PamResourcePermissionActions.CreateAccounts);
  const canDelete = can(PamResourcePermissionActions.DeleteFolder);
  const hasAnyAction = tabs.length > 0 || canCreateAccounts || canDelete;

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
        {tabs.map((tab) => (
          <DropdownMenuItem key={tab.value} onClick={() => onOpenTab(tab.value)}>
            <tab.icon />
            {tab.label}
          </DropdownMenuItem>
        ))}
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
