import { Folder } from "lucide-react";

import { TableCell, TableRow } from "@app/components/v3";
import {
  PamAccountType,
  TAccessiblePamAccount,
  TPamAccountListItem,
  TPamFolderWithCount
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { FolderAccountRow } from "./FolderAccountRow";
import { FolderActionsMenu } from "./FolderActionsMenu";

type Props = {
  folder: TPamFolderWithCount;
  search: string;
  // Matching accounts, supplied by the page's filter query. Undefined when nothing is filtered.
  accounts?: TPamAccountListItem[];
  onOpenFolderView: () => void;
  onOpenAccount: (accountId: string, tab?: PamSheetTab) => void;
  onLaunchAccount: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  onDeleteAccount: (accountId: string, accountName: string, accountType: PamAccountType) => void;
  onOpenFolder: (tab?: PamSheetTab) => void;
  onFolderAddAccount: () => void;
  onFolderDelete: () => void;
};

export const FolderAccountRows = ({
  folder,
  search,
  accounts,
  onOpenFolderView,
  onOpenAccount,
  onLaunchAccount,
  onRequestAccess,
  onDeleteAccount,
  onOpenFolder,
  onFolderAddAccount,
  onFolderDelete
}: Props) => {
  const count = accounts ? accounts.length : folder.accountCount;

  return (
    <>
      <TableRow className="cursor-pointer select-none" onClick={onOpenFolderView}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <Folder className="size-5 shrink-0 text-product-pam" />
            <span className="shrink-0 font-medium text-foreground">{folder.name}</span>
            <span className="shrink-0 text-xs text-muted">({count})</span>
            {folder.description && (
              <span className="max-w-md truncate text-muted">{folder.description}</span>
            )}
          </div>
        </TableCell>
        <TableCell className="w-20">
          <div className="flex items-center justify-end gap-1">
            <FolderActionsMenu
              folder={folder}
              onOpenTab={(tab) => onOpenFolder(tab)}
              onAddAccount={onFolderAddAccount}
              onDelete={onFolderDelete}
            />
          </div>
        </TableCell>
      </TableRow>

      {accounts?.map((account) => (
        <FolderAccountRow
          key={account.id}
          account={account}
          search={search}
          indented
          onOpenAccount={onOpenAccount}
          onLaunchAccount={onLaunchAccount}
          onRequestAccess={onRequestAccess}
          onDeleteAccount={onDeleteAccount}
        />
      ))}
    </>
  );
};
