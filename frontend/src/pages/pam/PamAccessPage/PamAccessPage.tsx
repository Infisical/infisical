import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { FolderOpen, Layers, Loader2, Search } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PAM_ACCOUNT_TYPE_MAP,
  TAccessiblePamAccount,
  useListAccessiblePamAccounts,
  useListAccessiblePamFolders
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PamSheetAction, usePamSheetState } from "@app/hooks/usePamSheetState";

import { FolderSection } from "./components/FolderSection";
import { LaunchSessionSheet } from "./components/LaunchSessionSheet";

const DEBOUNCE_MS = 300;

export const PamAccessPage = () => {
  const { t } = useTranslation();
  const { selectedAccountId, selectedAction, openSheet, closeSheet } = usePamSheetState();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [searchInput]);

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useListAccessiblePamAccounts({
      search: debouncedSearch || undefined,
      accountType: selectedAccountType || undefined,
      folderId: selectedFolderId || undefined
    });

  const allAccounts = useMemo(() => data?.pages.flatMap((p) => p.accounts) ?? [], [data?.pages]);

  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollSentinelRef.current;
    if (!el || !hasNextPage) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: folderOptions = [] } = useListAccessiblePamFolders();

  const sheetAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return allAccounts.find((a) => a.id === selectedAccountId) ?? null;
  }, [selectedAccountId, allAccounts]);

  const hasActiveFilters = searchInput.trim() || selectedAccountType || selectedFolderId;

  const folderGroups = useMemo(() => {
    const query = searchInput.toLowerCase().trim();
    const filtered = query
      ? allAccounts.filter(
          (a) => a.name.toLowerCase().includes(query) || a.folderName?.toLowerCase().includes(query)
        )
      : allAccounts;

    const groups = new Map<string, TAccessiblePamAccount[]>();
    filtered.forEach((account) => {
      const key = account.folderName ?? "Uncategorized";
      const existing = groups.get(key);
      if (existing) {
        existing.push(account);
      } else {
        groups.set(key, [account]);
      }
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allAccounts, searchInput]);

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Access" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.PAM}
          title="Access"
          description="Every account you can connect to or request access to."
        />

        <Card className="mt-4">
          <CardContent className="flex items-center gap-3">
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search accounts..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </InputGroup>
            <Select
              value={selectedAccountType}
              onValueChange={(val) => {
                setSelectedAccountType(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger>
                {!selectedAccountType && <Layers className="mr-1.5 size-4 text-muted" />}
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={4}>
                <SelectItem value="all">All platforms</SelectItem>
                {Object.entries(PAM_ACCOUNT_TYPE_MAP).map(([type, meta]) => (
                  <SelectItem key={type} value={type}>
                    <img
                      src={`/images/integrations/${meta.image}`}
                      alt={meta.name}
                      className="mr-1.5 inline-block size-4 rounded-sm"
                    />
                    {meta.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedFolderId}
              onValueChange={(val) => {
                setSelectedFolderId(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger>
                <FolderOpen className="mr-1.5 size-4 text-muted" />
                <SelectValue placeholder="All folders" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={4}>
                <SelectItem value="all">All folders</SelectItem>
                {folderOptions.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
          <CardContent className="flex flex-col gap-4">
            {isLoading && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            )}

            {!isLoading && folderGroups.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {hasActiveFilters ? "No accounts match your filters" : "No accounts available"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasActiveFilters
                      ? "Try adjusting your search or filters."
                      : "You don't have access to any accounts yet. Ask an admin to grant you access."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {folderGroups.map(([folderName, accounts]) => (
              <FolderSection
                key={folderName}
                folderName={folderName}
                accounts={accounts}
                onLaunch={(account) => openSheet(PamSheetAction.Launch, account.id)}
              />
            ))}
            {isFetchingNextPage && (
              <div className="flex justify-center py-3">
                <Loader2 className="size-5 animate-spin text-muted" />
              </div>
            )}
            <div ref={scrollSentinelRef} />
          </CardContent>
        </Card>
      </div>

      <LaunchSessionSheet
        account={selectedAction === PamSheetAction.Launch ? sheetAccount : null}
        isOpen={selectedAction === PamSheetAction.Launch && !!sheetAccount}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      />
    </>
  );
};
