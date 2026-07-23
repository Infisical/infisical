import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderOpen, KeyRound, Layers, Search } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
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
  SelectValue,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { useOrganization } from "@app/context";
import {
  TAccessiblePamAccount,
  useGetPamAccessCapabilities,
  useListAccessiblePamFolders,
  useListPamAccountTypes
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { FolderAccountGroup } from "./components/FolderAccountGroup";
import { LaunchSessionSheet } from "./components/LaunchSessionSheet";
import { RequestAccessSheet } from "./components/RequestAccessSheet";

export const PamAccessPage = () => {
  const { t } = useTranslation();

  const [sheetAccount, setSheetAccount] = useState<TAccessiblePamAccount | null>(null);
  const [requestAccount, setRequestAccount] = useState<TAccessiblePamAccount | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({});

  const { data: folders = [], isLoading: isLoadingFolders } = useListAccessiblePamFolders();
  const { data: accountTypes = [] } = useListPamAccountTypes();
  const { data: capabilities } = useGetPamAccessCapabilities();
  const { currentOrg } = useOrganization();

  // Anyone who can reach the Accounts page from the sidebar (product admins and
  // resource admins) sees a CTA that points them there — otherwise the empty
  // state on a fresh org is a dead end.
  const canManageAccounts = Boolean(capabilities?.isProductAdmin || capabilities?.isResourceAdmin);

  const query = searchInput.trim();

  const filterActive = Boolean(query || selectedAccountType);
  const hasActiveFilters = Boolean(query || selectedAccountType || selectedFolderId);

  useEffect(() => {
    setResultCounts({});
  }, [query, selectedAccountType]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleResultCount = useCallback((folderId: string, count: number) => {
    setResultCounts((prev) => (prev[folderId] === count ? prev : { ...prev, [folderId]: count }));
  }, []);

  const nonEmptyFolders = folders.filter((folder) => folder.accountCount > 0);
  const visibleFolders = selectedFolderId
    ? nonEmptyFolders.filter((folder) => folder.id === selectedFolderId)
    : nonEmptyFolders;

  const isFolderOpen = (folderId: string) =>
    filterActive || folderId === selectedFolderId || expandedFolders.has(folderId);

  const filterSettled = visibleFolders.every((f) => resultCounts[f.id] !== undefined);
  const filterHasMatches = visibleFolders.some((f) => (resultCounts[f.id] ?? 0) > 0);
  const showNoMatches = filterActive && filterSettled && !filterHasMatches;
  const showEmpty = !isLoadingFolders && (visibleFolders.length === 0 || showNoMatches);

  let emptyTitle: string;
  let emptyDescription: string;
  if (hasActiveFilters) {
    emptyTitle = "No accounts match your filters";
    emptyDescription = "Try adjusting your search or filters.";
  } else if (canManageAccounts) {
    emptyTitle = "No accounts yet";
    emptyDescription =
      "Onboard your first privileged account from the Accounts page to get started.";
  } else {
    emptyTitle = "No accounts available";
    emptyDescription = "Ask your PAM admin to grant you access to a folder or account.";
  }

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "My Access" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.PAM}
          icon={KeyRound}
          title="My Access"
          description="Launch sessions for accounts you have access to."
        />

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>My Access</CardTitle>
            <CardDescription>
              Accounts you can connect to. Launch a session or request approval for gated accounts.
            </CardDescription>
          </CardHeader>
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
              onValueChange={(val) => setSelectedAccountType(val === "all" ? "" : val)}
            >
              <SelectTrigger>
                {!selectedAccountType && <Layers className="mr-1.5 size-4 text-muted" />}
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={4}>
                <SelectItem value="all">All types</SelectItem>
                {accountTypes.map((meta) => (
                  <SelectItem key={meta.type} value={meta.type}>
                    <img
                      src={`/images/integrations/${meta.icon}`}
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
              onValueChange={(val) => setSelectedFolderId(val === "all" ? "" : val)}
            >
              <SelectTrigger>
                <FolderOpen className="mr-1.5 size-4 text-muted" />
                <SelectValue placeholder="All folders" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={4}>
                <SelectItem value="all">All folders</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>

          {isLoadingFolders && (
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {showEmpty && (
            <CardContent>
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>{emptyTitle}</EmptyTitle>
                  <EmptyDescription>{emptyDescription}</EmptyDescription>
                </EmptyHeader>
                {!hasActiveFilters && canManageAccounts && (
                  <EmptyContent>
                    <Button variant="pam" asChild>
                      <Link
                        to="/organizations/$orgId/pam/accounts"
                        params={{ orgId: currentOrg.id }}
                      >
                        Go to Accounts
                        <ArrowRight />
                      </Link>
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            </CardContent>
          )}

          {!isLoadingFolders && !showEmpty && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleFolders.map((folder) => (
                  <FolderAccountGroup
                    key={folder.id}
                    folder={folder}
                    isOpen={isFolderOpen(folder.id)}
                    onToggle={() => toggleFolder(folder.id)}
                    search={searchInput}
                    accountType={selectedAccountType}
                    filterActive={filterActive}
                    onLaunch={setSheetAccount}
                    onRequestAccess={setRequestAccount}
                    onResultCount={handleResultCount}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <LaunchSessionSheet
        account={sheetAccount}
        isOpen={!!sheetAccount}
        onOpenChange={(open) => {
          if (!open) setSheetAccount(null);
        }}
      />

      <RequestAccessSheet
        account={requestAccount}
        isOpen={!!requestAccount}
        onOpenChange={(open) => {
          if (!open) setRequestAccount(null);
        }}
      />
    </>
  );
};
