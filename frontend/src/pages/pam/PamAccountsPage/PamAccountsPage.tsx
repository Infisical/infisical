import { useCallback, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen, FolderPlus, Layers, Plus, Search } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  ButtonGroup,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
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
import {
  PamAccountType,
  useDeletePamAccount,
  useDeletePamFolder,
  useListPamAccountTemplates,
  useListPamFoldersAdmin
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { AccountPlatformIcon } from "../PamAccessPage/components/AccountPlatformIcon";
import { AccountDetailSheet } from "./components/AccountDetailSheet";
import { CreateAccountSheet } from "./components/CreateAccountSheet";
import { CreateFolderModal } from "./components/CreateFolderModal";
import { DeleteAccountModal } from "./components/DeleteAccountModal";
import { DeleteFolderModal } from "./components/DeleteFolderModal";
import { FolderAccountRows } from "./components/FolderAccountRows";
import { FolderDetailSheet } from "./components/FolderDetailSheet";

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5"];

export const PamAccountsPage = () => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({});

  const { data: folders = [], isLoading: isLoadingFolders } = useListPamFoldersAdmin();
  const { data: templates = [] } = useListPamAccountTemplates();

  const deleteAccount = useDeletePamAccount();
  const deleteFolder = useDeletePamFolder();

  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "createAccount",
    "deleteAccount",
    "createFolder",
    "deleteFolder"
  ] as const);

  const accountSheet = usePamSheetState("accountId");
  const folderSheet = usePamSheetState("folderId");

  const query = searchInput.trim();
  // Active filters force-open every folder so matches surface; otherwise folders load lazily on open
  const filterActive = Boolean(query || selectedTemplateId);
  const hasActiveFilters = Boolean(query || selectedFolderId || selectedTemplateId);

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

  const visibleFolders = selectedFolderId
    ? folders.filter((folder) => folder.id === selectedFolderId)
    : folders;

  const isFolderOpen = (folderId: string) =>
    filterActive || folderId === selectedFolderId || expandedFolders.has(folderId);

  const filterSettled = visibleFolders.every((f) => resultCounts[f.id] !== undefined);
  const filterHasMatches = visibleFolders.some((f) => (resultCounts[f.id] ?? 0) > 0);
  const showNoMatches = filterActive && filterSettled && !filterHasMatches;
  const showEmpty = !isLoadingFolders && (visibleFolders.length === 0 || showNoMatches);

  const handleDelete = () => {
    const { accountId, accountType } = popUp.deleteAccount.data as {
      accountId: string;
      accountType: PamAccountType;
    };

    deleteAccount.mutate(
      { accountId, accountType },
      {
        onSuccess: () => {
          createNotification({ text: "Account deleted", type: "success" });
          handlePopUpClose("deleteAccount");
        }
      }
    );
  };

  const handleDeleteFolder = () => {
    const { folderId } = popUp.deleteFolder.data as { folderId: string };

    deleteFolder.mutate(
      { folderId },
      {
        onSuccess: () => {
          createNotification({ text: "Folder deleted", type: "success" });
          handlePopUpClose("deleteFolder");
        }
      }
    );
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Accounts" })}</title>
      </Helmet>
      <PageHeader
        title="Accounts"
        description="Privileged accounts grouped into folders."
        scope={ProjectType.PAM}
        icon={FolderOpen}
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
            value={selectedFolderId}
            onValueChange={(val) => setSelectedFolderId(val === "all" ? "" : val)}
          >
            <SelectTrigger>
              <FolderOpen className="mr-1.5 size-4 text-muted" />
              <SelectValue placeholder="All folders" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All folders</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedTemplateId}
            onValueChange={(val) => setSelectedTemplateId(val === "all" ? "" : val)}
          >
            <SelectTrigger>
              {!selectedTemplateId && <Layers className="mr-1.5 size-4 text-muted" />}
              <SelectValue placeholder="All templates" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All templates</SelectItem>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  <span className="flex items-center gap-1.5">
                    <AccountPlatformIcon accountType={tpl.type} size={16} />
                    {tpl.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ButtonGroup>
            <Button
              variant="pam"
              className="rounded-r-none"
              onClick={() => handlePopUpOpen("createAccount")}
            >
              <Plus />
              Add Account
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  variant="pam"
                  aria-label="More create options"
                  className="border-l-transparent"
                >
                  <ChevronDown />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => handlePopUpOpen("createFolder")}>
                  <FolderPlus />
                  Add Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </CardContent>

        {isLoadingFolders && (
          <CardContent>
            <div className="flex flex-col gap-3">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        )}

        {showEmpty && (
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {hasActiveFilters ? "No results match your filters" : "No accounts yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "Create your first account to get started."}
                </EmptyDescription>
              </EmptyHeader>
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
                <FolderAccountRows
                  key={folder.id}
                  folder={folder}
                  isOpen={isFolderOpen(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  search={searchInput}
                  templateId={selectedTemplateId}
                  filterActive={filterActive}
                  onOpenAccount={(id, tab) => accountSheet.openSheet(id, tab)}
                  onDeleteAccount={(target) => handlePopUpOpen("deleteAccount", target)}
                  onOpenFolder={(tab) => folderSheet.openSheet(folder.id, tab)}
                  onFolderAddAccount={() =>
                    handlePopUpOpen("createAccount", { folderId: folder.id })
                  }
                  onFolderDelete={() =>
                    handlePopUpOpen("deleteFolder", {
                      folderId: folder.id,
                      folderName: folder.name,
                      accountCount: folder.accountCount
                    })
                  }
                  onResultCount={handleResultCount}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateAccountSheet
        isOpen={popUp.createAccount.isOpen}
        defaultFolderId={(popUp.createAccount.data as { folderId?: string } | undefined)?.folderId}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createAccount");
        }}
      />

      <CreateFolderModal
        isOpen={popUp.createFolder.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createFolder");
        }}
      />

      <AccountDetailSheet
        isOpen={accountSheet.isOpen}
        accountId={accountSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) accountSheet.closeSheet();
        }}
      />

      <FolderDetailSheet
        isOpen={folderSheet.isOpen}
        folder={folders.find((f) => f.id === folderSheet.selectedId)}
        activeTab={folderSheet.tab}
        onTabChange={folderSheet.setTab}
        onOpenChange={(open) => {
          if (!open) folderSheet.closeSheet();
        }}
      />

      <DeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        accountName={
          (popUp.deleteAccount.data as { accountName: string } | undefined)?.accountName ?? ""
        }
        accountType={
          (popUp.deleteAccount.data as { accountType: PamAccountType } | undefined)?.accountType
        }
        isLoading={deleteAccount.isPending}
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteAccount");
        }}
      />

      <DeleteFolderModal
        isOpen={popUp.deleteFolder.isOpen}
        folderName={
          (popUp.deleteFolder.data as { folderName: string } | undefined)?.folderName ?? ""
        }
        accountCount={
          (popUp.deleteFolder.data as { accountCount: number } | undefined)?.accountCount
        }
        isLoading={deleteFolder.isPending}
        onConfirm={handleDeleteFolder}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteFolder");
        }}
      />
    </div>
  );
};
