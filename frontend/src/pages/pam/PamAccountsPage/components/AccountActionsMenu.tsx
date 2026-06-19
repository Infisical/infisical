import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import { PamResourcePermissionActions, usePamAccountActions } from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PAM_ACCOUNT_TABS, visiblePamTabs } from "../../components/pamResourceTabs";

type Props = {
  accountId: string;
  onOpenTab: (tab: PamSheetTab) => void;
  onDelete: () => void;
};

export const AccountActionsMenu = ({ accountId, onOpenTab, onDelete }: Props) => {
  // Defer the permission fetch until the menu is first opened to avoid a request per row
  const [hasOpened, setHasOpened] = useState(false);
  const { can, isLoading } = usePamAccountActions(accountId, hasOpened);

  const tabs = visiblePamTabs(PAM_ACCOUNT_TABS, can);
  const canDelete = can(PamResourcePermissionActions.DeleteAccounts);
  const hasAnyAction = tabs.length > 0 || canDelete;

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
        {tabs.map((tab) => (
          <DropdownMenuItem key={tab.value} onClick={() => onOpenTab(tab.value)}>
            <tab.icon />
            {tab.label}
          </DropdownMenuItem>
        ))}
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
