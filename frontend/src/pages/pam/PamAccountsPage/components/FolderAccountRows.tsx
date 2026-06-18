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
  onOpenAccount: (accountId: string) => void;
  onConfigureAccount: (accountId: string) => void;
  onDeleteAccount: (target: DeleteTarget) => void;
  onFolderDetails: () => void;
  onFolderConfigure: () => void;
  onFolderAddAccount: () => void;
  onFolderDelete: () => void;
  onResultCount: (folderId: string, count: number) => void;
};

const SKELETON_KEYS = ["a", "b", "c"];

export const FolderAccountRows = ({
  folder,
  isOpen,
  onToggle,
  search,
  templateId,
  filterActive,
  onOpenAccount,
  onConfigureAccount,
  onDeleteAccount,
  onFolderDetails,
  onFolderConfigure,
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
            <span className="font-medium text-foreground">{folder.name}</span>
            {folder.description && <span className="text-muted">{folder.description}</span>}
          </div>
        </TableCell>
        <TableCell className="w-20">
          <div className="flex items-center justify-end gap-1">
            <FolderActionsMenu
              folder={folder}
              onDetails={onFolderDetails}
              onConfigure={onFolderConfigure}
              onAddAccount={onFolderAddAccount}
              onDelete={onFolderDelete}
            />
          </div>
        </TableCell>
      </TableRow>

      {isOpen && isLoading && (
        <TableRow>
          <TableCell colSpan={2}>
            <div className="flex flex-col gap-2 pl-[26px]">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-8 w-full rounded-md" />
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
                </div>
              </TableCell>
              <TableCell className="w-20">
                <div className="flex items-center justify-end gap-1">
                  <AccountActionsMenu
                    accountId={account.id}
                    onDetails={() => onOpenAccount(account.id)}
                    onConfigure={() => onConfigureAccount(account.id)}
                    onDelete={() =>
                      onDeleteAccount({
                        accountId: account.id,
                        accountName: account.name,
                        accountType
                      })
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
};
