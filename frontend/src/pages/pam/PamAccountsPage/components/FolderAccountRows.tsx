import { useEffect, useMemo } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import { Badge, TableCell, TableRow } from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PamAccountType,
  TPamFolderWithCount,
  useListPamAccountsAdmin,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { AccountAccessibilityBadge } from "../../components/AccountAccessibilityBadge";
import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { AccountActionsMenu } from "./AccountActionsMenu";
import { FolderActionsMenu } from "./FolderActionsMenu";

type DeleteTarget = { accountId: string; accountName: string; accountType: PamAccountType };

type Props = {
  folder: TPamFolderWithCount;
  isOpen: boolean;
  onToggle: () => void;
  search: string;
  templateId: string;
  filterActive: boolean;
  onOpenAccount: (accountId: string, tab?: PamSheetTab) => void;
  onDeleteAccount: (target: DeleteTarget) => void;
  onLaunchAccount: (accountId: string, accountType: PamAccountType) => void;
  onOpenFolder: (tab?: PamSheetTab) => void;
  onFolderAddAccount: () => void;
  onFolderDelete: () => void;
  onResultCount: (folderId: string, count: number) => void;
};

export const FolderAccountRows = ({
  folder,
  isOpen,
  onToggle,
  search,
  templateId,
  filterActive,
  onOpenAccount,
  onDeleteAccount,
  onLaunchAccount,
  onOpenFolder,
  onFolderAddAccount,
  onFolderDelete,
  onResultCount
}: Props) => {
  const { map } = usePamAccountTypeMap();
  // Only fetch this folder's accounts once it's open (lazy load per folder)
  const { data, isLoading } = useListPamAccountsAdmin({ folderId: folder.id }, { enabled: isOpen });
  const accounts = data ?? [];

  const q = search.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Client-side filtering keeps search/template instant once a folder's accounts are loaded
  const accountsToShow = useMemo(() => {
    let list = accounts;
    if (templateId) list = list.filter((a) => a.templateId === templateId);
    if (hasQuery) {
      list = list.filter((a) => `${a.name} ${a.description ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [accounts, templateId, q, hasQuery]);

  useEffect(() => {
    if (isOpen && !isLoading) onResultCount(folder.id, accountsToShow.length);
  }, [isOpen, isLoading, accountsToShow.length, folder.id, onResultCount]);

  // While filtering, hide folders with no matching accounts
  if (filterActive && isOpen && !isLoading && accountsToShow.length === 0) {
    return null;
  }

  let count = folder.accountCount;
  if (isOpen && !isLoading) count = filterActive ? accountsToShow.length : accounts.length;

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
        accountsToShow.map((account) => {
          const accountType = account.accountType as PamAccountType;
          return (
            <TableRow
              key={account.id}
              className="cursor-pointer"
              onClick={() => onOpenAccount(account.id)}
            >
              <TableCell>
                <div className="flex items-center gap-2.5 pl-[26px]">
                  <AccountPlatformIcon accountType={accountType} size={20} />
                  <span className="font-medium text-foreground">
                    <HighlightText text={account.name} highlight={search} />
                  </span>
                  <Badge variant="neutral">{map[accountType]?.name ?? account.accountType}</Badge>
                  <AccountAccessibilityBadge issues={account.accessibilityIssues} />
                </div>
              </TableCell>
              <TableCell className="w-20">
                <div className="flex items-center justify-end gap-1">
                  <AccountActionsMenu
                    accountId={account.id}
                    onOpenTab={(tab) => onOpenAccount(account.id, tab)}
                    onDelete={() =>
                      onDeleteAccount({
                        accountId: account.id,
                        accountName: account.name,
                        accountType
                      })
                    }
                    onLaunch={() => onLaunchAccount(account.id, accountType)}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
};
