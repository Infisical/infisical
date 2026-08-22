import { useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  PamResourcePermissionActions,
  TPamFolderWithCount,
  usePamFolderActions
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PAM_FOLDER_TABS } from "../../components/pamResourceTabs";

type Props = {
  folder: TPamFolderWithCount;
  onOpenTab: (tab: PamSheetTab) => void;
  onAddAccount?: () => void;
  onDelete: () => void;
};

export const FolderActionsMenu = ({ folder, onOpenTab, onAddAccount, onDelete }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  // Every role sees the same menu with the same items, so permissions only decide what's disabled —
  // fetch them when the menu opens rather than once per visible folder on page load.
  const { can, isLoading } = usePamFolderActions(folder.id, isOpen);

  // Treat an unresolved permission set as "not allowed" so nothing is actionable until it loads.
  const allowed = (action: PamResourcePermissionActions) => !isLoading && can(action);
  const canCreateAccounts = allowed(PamResourcePermissionActions.CreateAccounts);
  const canDelete = allowed(PamResourcePermissionActions.DeleteFolder);
  // Items are disabled while permissions load, but the reason isn't known yet — don't claim it's
  // a permission problem until the fetch settles.
  const showReason = !isLoading;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
        {PAM_FOLDER_TABS.map((tab) => {
          const hasPermission = !tab.action || allowed(tab.action);
          return (
            <Tooltip key={tab.value}>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem
                    isDisabled={!hasPermission}
                    onClick={() => onOpenTab(tab.value)}
                  >
                    <tab.icon />
                    {tab.label}
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              {!hasPermission && showReason && (
                <TooltipContent side="left">
                  You don&apos;t have permission to access {tab.label.toLowerCase()}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
        {onAddAccount && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenuItem isDisabled={!canCreateAccounts} onClick={onAddAccount}>
                  <Plus />
                  Add Account
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            {!canCreateAccounts && showReason && (
              <TooltipContent side="left">
                You don&apos;t have permission to create accounts in this folder
              </TooltipContent>
            )}
          </Tooltip>
        )}
        <DropdownMenuSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
                <Trash2 />
                Delete Folder
              </DropdownMenuItem>
            </div>
          </TooltipTrigger>
          {!canDelete && showReason && (
            <TooltipContent side="left">
              You don&apos;t have permission to delete this folder
            </TooltipContent>
          )}
        </Tooltip>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
