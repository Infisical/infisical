import { useEffect, useMemo, useRef } from "react";
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react";

import { TableCell, TableRow } from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  TAccessiblePamAccount,
  TAccessiblePamFolder,
  useListAccessiblePamAccounts
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";

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
  // Debounced term drives the server query; one request per open folder
  const [debouncedSearch] = useDebounce(search);
  const q = debouncedSearch.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Filter server-side so matches on later pages stay reachable
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListAccessiblePamAccounts(
      {
        folderId: folder.id,
        ...(accountType ? { accountType } : {}),
        ...(hasQuery ? { search: q } : {})
      },
      { enabled: isOpen }
    );

  const accounts = data?.pages.flatMap((p) => p.accounts) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Narrow loaded rows on the raw term so non-matches hide instantly, ahead of the debounce
  const accountsToShow = useMemo(() => {
    const live = search.trim().toLowerCase();
    if (!live) return accounts;
    return accounts.filter((a) => `${a.name} ${a.description ?? ""}`.toLowerCase().includes(live));
  }, [accounts, search]);

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
    if (isOpen && !isLoading) onResultCount(folder.id, totalCount);
  }, [isOpen, isLoading, totalCount, folder.id, onResultCount]);

  // While filtering, hide folders with no matching accounts
  if (filterActive && isOpen && !isLoading && totalCount === 0) {
    return null;
  }

  let count = folder.accountCount;
  if (isOpen && !isLoading) count = search.trim() ? accountsToShow.length : totalCount;

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
            <span className="text-xs text-muted">({count})</span>
          </div>
        </TableCell>
        <TableCell className="w-20" />
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
