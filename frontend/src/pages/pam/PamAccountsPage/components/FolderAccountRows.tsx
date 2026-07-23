import { useEffect, useMemo } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import { Badge, TableCell, TableRow } from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PamAccessStatus,
  PamAccountType,
  TAccessiblePamAccount,
  TPamFolderWithCount,
  useListPamAccountsAdmin,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { AccountPlatformIcon } from "../../PamAccessPage/components/AccountPlatformIcon";
import { AccountAccessibilityBadgeWithPermission } from "./AccountAccessibilityBadgeWithPermission";
import { AccountRowActions } from "./AccountRowActions";
import { FolderActionsMenu } from "./FolderActionsMenu";

type Props = {
  folder: TPamFolderWithCount;
  isOpen: boolean;
  onToggle: () => void;
  search: string;
  templateId: string;
  filterActive: boolean;
  onOpenAccount: (accountId: string, tab?: PamSheetTab) => void;
  onLaunchAccount: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  onDeleteAccount: (accountId: string, accountName: string, accountType: PamAccountType) => void;
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
  onLaunchAccount,
  onRequestAccess,
  onDeleteAccount,
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
          const { requiresApproval, accessStatus } = account;
          const isGranted = accessStatus === PamAccessStatus.Granted;
          const needsApproval = requiresApproval && !isGranted;

          const launchableAccount: TAccessiblePamAccount = {
            id: account.id,
            name: account.name,
            description: account.description,
            folderId: account.folderId,
            folderName: account.folderName ?? "",
            templateId: account.templateId,
            templateName: account.templateName,
            accountType,
            canLaunch: account.isAccessible && !needsApproval,
            requiresApproval,
            requireReason: account.requireReason,
            accessStatus,
            grantExpiresAt: account.grantExpiresAt,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt
          };

          return (
            <TableRow key={account.id}>
              <TableCell>
                <div className="flex items-center gap-2.5 pl-[26px]">
                  <AccountPlatformIcon accountType={accountType} size={20} />
                  <span className="font-medium text-foreground">
                    <HighlightText text={account.name} highlight={search} />
                  </span>
                  <Badge variant="neutral">{map[accountType]?.name ?? account.accountType}</Badge>
                  <AccountAccessibilityBadgeWithPermission
                    accountId={account.id}
                    issues={account.accessibilityIssues}
                  />
                </div>
              </TableCell>
              <TableCell className="w-20">
                <div className="flex items-center justify-end">
                  <AccountRowActions
                    accountId={account.id}
                    accountType={accountType}
                    isAccessible={account.isAccessible}
                    requiresApproval={requiresApproval}
                    accessStatus={accessStatus}
                    onLaunch={() => onLaunchAccount(launchableAccount)}
                    onRequestAccess={() => onRequestAccess(launchableAccount)}
                    onOpenTab={(tab) => onOpenAccount(account.id, tab)}
                    onDelete={() => onDeleteAccount(account.id, account.name, accountType)}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
};
