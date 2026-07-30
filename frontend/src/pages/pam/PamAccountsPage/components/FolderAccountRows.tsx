import { ChevronRight, Folder, FolderOpen } from "lucide-react";

import { TableCell, TableRow } from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PamAccountType,
  TAccessiblePamAccount,
  TPamAccountListItem,
  TPamFolderWithCount,
  useListPamAccounts
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { FolderAccountRow } from "./FolderAccountRow";
import { FolderActionsMenu } from "./FolderActionsMenu";

type Props = {
  folder: TPamFolderWithCount;
  isOpen: boolean;
  onToggle: () => void;
  search: string;
  /**
   * Pre-filtered accounts for this folder, supplied by the page's single server-side filter query.
   * When omitted (no active filter) the folder fetches its own accounts lazily on open.
   */
  accounts?: TPamAccountListItem[];
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
  isOpen,
  onToggle,
  search,
  accounts: providedAccounts,
  onOpenAccount,
  onLaunchAccount,
  onRequestAccess,
  onDeleteAccount,
  onOpenFolder,
  onFolderAddAccount,
  onFolderDelete
}: Props) => {
  const isFiltering = providedAccounts !== undefined;

  // Only fetch this folder's accounts once it's open (lazy load per folder), and never while the
  // page is filtering — the matches already arrived in the page's single filtered request.
  const { data, isLoading: isFetching } = useListPamAccounts(
    { folderId: folder.id },
    { enabled: isOpen && !isFiltering }
  );

  const accountsToShow = providedAccounts ?? data ?? [];
  const isLoading = !isFiltering && isFetching;

  const count = isOpen && !isLoading ? accountsToShow.length : folder.accountCount;

  return (
    <>
      <TableRow className="cursor-pointer select-none" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <ChevronRight
              className={`size-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
            {isOpen ? (
              <FolderOpen className="size-5 shrink-0 text-product-pam" />
            ) : (
              <Folder className="size-5 shrink-0 text-product-pam" />
            )}
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

      {isOpen && isLoading && folder.accountCount > 0 && (
        <TableRow>
          <TableCell colSpan={2}>
            <div className="flex flex-col gap-2 pl-[26px]">
              {Array.from({ length: folder.accountCount }).map((_, i) => (
                <Skeleton key={`skeleton-${i + 1}`} className="h-8 w-full rounded-md" />
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}

      {isOpen &&
        !isLoading &&
        accountsToShow.map((account) => (
          <FolderAccountRow
            key={account.id}
            account={account}
            search={search}
            onOpenAccount={onOpenAccount}
            onLaunchAccount={onLaunchAccount}
            onRequestAccess={onRequestAccess}
            onDeleteAccount={onDeleteAccount}
          />
        ))}
    </>
  );
};
