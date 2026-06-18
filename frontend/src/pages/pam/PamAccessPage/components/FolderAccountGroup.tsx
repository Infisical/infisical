import { useEffect, useMemo, useRef } from "react";
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import { TableCell, TableRow } from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  TAccessiblePamAccount,
  TAccessiblePamFolder,
  useListAccessiblePamAccounts
} from "@app/hooks/api/pam";

import { AccountRow } from "./AccountRow";

type Props = {
  folder: TAccessiblePamFolder;
  isOpen: boolean;
  onToggle: () => void;
  search: string;
  accountType: string;
  filterActive: boolean;
  onLaunch: (account: TAccessiblePamAccount) => void;
  onResultCount: (folderId: string, count: number) => void;
};

const SKELETON_KEYS = ["a", "b", "c"];

export const FolderAccountGroup = ({
  folder,
  isOpen,
  onToggle,
  search,
  accountType,
  filterActive,
  onLaunch,
  onResultCount
}: Props) => {
  // Only fetch this folder's accounts once it's open (lazy load per folder)
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListAccessiblePamAccounts({ folderId: folder.id }, { enabled: isOpen });

  const accounts = data?.pages.flatMap((p) => p.accounts) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const q = search.trim().toLowerCase();
  const hasQuery = q.length > 0;
  const folderNameMatches = hasQuery && folder.name.toLowerCase().includes(q);

  // Client-side filtering keeps search/type instant once a folder's accounts are loaded
  const accountsToShow = useMemo(() => {
    let list = accounts;
    if (accountType) list = list.filter((a) => a.accountType === accountType);
    if (hasQuery && !folderNameMatches) {
      list = list.filter((a) => `${a.name} ${a.description ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [accounts, accountType, q, hasQuery, folderNameMatches]);

  const effectiveCount = folderNameMatches
    ? Math.max(accountsToShow.length, 1)
    : accountsToShow.length;

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (isOpen && !isLoading) onResultCount(folder.id, effectiveCount);
  }, [isOpen, isLoading, effectiveCount, folder.id, onResultCount]);

  // While filtering, hide folders with no name match and no matching accounts
  if (filterActive && isOpen && !isLoading && !folderNameMatches && accountsToShow.length === 0) {
    return null;
  }

  let count = folder.accountCount;
  if (isOpen && !isLoading) count = filterActive ? accountsToShow.length : totalCount;

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
            <span className="font-medium text-foreground">
              <HighlightText text={folder.name} highlight={search} />
            </span>
            <span className="text-xs text-muted">({count})</span>
          </div>
        </TableCell>
        <TableCell className="w-20" />
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
        accountsToShow.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            search={search}
            onLaunch={onLaunch}
            indented
          />
        ))}

      {isOpen && hasNextPage && (
        <TableRow>
          <TableCell colSpan={2}>
            <div ref={sentinelRef} className="flex justify-center py-2">
              {isFetchingNextPage && <Loader2 className="size-4 animate-spin text-muted" />}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
