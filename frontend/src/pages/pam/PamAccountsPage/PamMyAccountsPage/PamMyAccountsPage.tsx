import { useRef, useState } from "react";
import { Filter, FolderOpen, Search } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  ProviderIcon,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { PageHeader } from "@app/components/v3/platform";
import { useOrganization } from "@app/context";
import {
  PamAccessType,
  PamAccountType,
  TAccessiblePamAccount,
  useDeletePamAccount,
  useListPamAccounts,
  useListPamAccountTypes
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";
import { useSlashFocusSearch } from "@app/hooks/useSlashFocusSearch";

import { LaunchSessionSheet } from "../../components/LaunchSessionSheet";
import { RequestAccessSheet } from "../../components/RequestAccessSheet";
import { MY_ACCOUNTS_ACTION } from "../../constants";
import { PamDocsUrls } from "../../pam-docs-urls";
import { AccountDetailSheet } from "../components/AccountDetailSheet";
import { AccountsBreadcrumb } from "../components/AccountsBreadcrumb";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { FolderAccountRow } from "../components/FolderAccountRow";
import { ViewCredentialsModal } from "../components/ViewCredentialsModal";

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5"];

export const PamMyAccountsPage = () => {
  const { currentOrg } = useOrganization();

  const [searchInput, setSearchInput] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useSlashFocusSearch(searchInputRef);
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");

  const [debouncedSearch] = useDebounce(searchInput);
  const query = debouncedSearch.trim();

  const { data: accountTypes = [] } = useListPamAccountTypes();
  const { data: accounts = [], isPending: isLoading } = useListPamAccounts({
    filterByAction: MY_ACCOUNTS_ACTION,
    search: query || undefined,
    accountType: selectedAccountType || undefined
  });

  const deleteAccount = useDeletePamAccount();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["deleteAccount"] as const);

  const accountSheet = usePamSheetState("accountId");

  const [launchAccount, setLaunchAccount] = useState<TAccessiblePamAccount | null>(null);
  const [requestAccount, setRequestAccount] = useState<TAccessiblePamAccount | null>(null);
  const [requestAccessType, setRequestAccessType] = useState(PamAccessType.Session);
  const [credentialAccount, setCredentialAccount] = useState<TAccessiblePamAccount | null>(null);

  const requestSessionAccess = (account: TAccessiblePamAccount) => {
    setRequestAccessType(PamAccessType.Session);
    setRequestAccount(account);
  };

  const requestCredentialAccess = (account: TAccessiblePamAccount) => {
    setRequestAccessType(PamAccessType.Credential);
    setRequestAccount(account);
  };

  const handleDeleteAccount = () => {
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

  const selectedTypeName = accountTypes.find((meta) => meta.type === selectedAccountType)?.name;
  const hasActiveFilters = Boolean(query || selectedAccountType);

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <PageTitle title="My Accounts" />

      <PageHeader
        title="Accounts"
        description="Access and manage privileged accounts."
        scope={ProjectType.PAM}
        icon={FolderOpen}
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            Accounts
            <DocumentationLinkBadge href={PamDocsUrls.accounts.overview} />
            <AccountsBreadcrumb orgId={currentOrg.id} folderName="My Accounts" />
          </CardTitle>
          <CardDescription>
            Accounts you can launch sessions on, across every folder.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        variant={selectedAccountType ? "pam" : "outline"}
                        aria-label="Filter by account type"
                      >
                        <Filter />
                      </IconButton>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{selectedTypeName ?? "Filter by account type"}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
                  <DropdownMenuLabel>Account Type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedAccountType || "all"}
                    onValueChange={(val) => setSelectedAccountType(val === "all" ? "" : val)}
                  >
                    <DropdownMenuRadioItem value="all">All Types</DropdownMenuRadioItem>
                    {accountTypes.map((meta) => (
                      <DropdownMenuRadioItem key={meta.type} value={meta.type}>
                        <ProviderIcon
                          icon={meta.icon}
                          alt={meta.name}
                          className="size-4 rounded-sm"
                        />
                        {meta.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <InputGroup className="w-64">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  ref={searchInputRef}
                  placeholder="Search accounts..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </InputGroup>
            </div>
          </CardAction>
        </CardHeader>

        {isLoading && (
          <CardContent>
            <div className="flex flex-col gap-3">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        )}

        {!isLoading && accounts.length === 0 && (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>
                  {hasActiveFilters ? "No accounts match your filters" : "No accounts available"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasActiveFilters
                    ? "Try adjusting your search or filters."
                    : "Ask your PAM admin to grant you access to a folder or account."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        )}

        {!isLoading && accounts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <FolderAccountRow
                  key={account.id}
                  account={account}
                  search={debouncedSearch}
                  showFolderName
                  onOpenAccount={(id, tab) => accountSheet.openSheet(id, tab)}
                  onLaunchAccount={setLaunchAccount}
                  onRequestAccess={requestSessionAccess}
                  onViewCredentials={setCredentialAccount}
                  onRequestCredentialAccess={requestCredentialAccess}
                  onDeleteAccount={(accountId, accountName, accountType) =>
                    handlePopUpOpen("deleteAccount", { accountId, accountName, accountType })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AccountDetailSheet
        isOpen={accountSheet.isOpen}
        accountId={accountSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) accountSheet.closeSheet();
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
        onConfirm={handleDeleteAccount}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteAccount");
        }}
      />

      <LaunchSessionSheet
        account={launchAccount}
        isOpen={launchAccount !== null}
        onOpenChange={(open) => {
          if (!open) setLaunchAccount(null);
        }}
      />

      <RequestAccessSheet
        account={requestAccount}
        accessType={requestAccessType}
        isOpen={!!requestAccount}
        onOpenChange={(open) => {
          if (!open) setRequestAccount(null);
        }}
        onGranted={(account, grantedAccessType) => {
          if (grantedAccessType === PamAccessType.Credential) setCredentialAccount(account);
          else setLaunchAccount(account);
        }}
      />

      <ViewCredentialsModal
        accountId={credentialAccount?.id}
        accountName={credentialAccount?.name}
        accountType={credentialAccount?.accountType}
        requireReason={Boolean(credentialAccount?.requireReason)}
        isOpen={credentialAccount !== null}
        onOpenChange={(open) => {
          if (!open) setCredentialAccount(null);
        }}
      />
    </div>
  );
};
