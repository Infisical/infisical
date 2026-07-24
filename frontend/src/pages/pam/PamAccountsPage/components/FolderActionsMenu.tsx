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
  // Eagerly fetch permissions so we can hide the menu if user has no actions
  const { can, isLoading } = usePamFolderActions(folder.id, true);

  const tabs = visiblePamTabs(PAM_FOLDER_TABS, can);
  const canCreateAccounts = can(PamResourcePermissionActions.CreateAccounts);
  const canDelete = can(PamResourcePermissionActions.DeleteFolder);
  const hasAnyAction = tabs.length > 0 || canCreateAccounts || canDelete;

  // Hide the menu entirely while loading or if user has no folder management permissions
  if (isLoading || !hasAnyAction) {
    return null;
  }

  return (
    <DropdownMenu>
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
