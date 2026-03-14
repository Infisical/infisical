import { useCallback, useEffect, useMemo, useState } from "react";
import { faFilter, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import {
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  KeyRoundIcon,
  LogInIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button as V2Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton as V2IconButton,
  Input as V2Input
} from "@app/components/v2";
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce, usePopUp, useToggle } from "@app/hooks";
import { ApprovalPolicyType, useCheckPolicyMatch } from "@app/hooks/api/approvalPolicies";
import {
  PamAccountRotationStatus,
  PamResourceType,
  TActiveDirectoryAccount,
  TPamAccount,
  TPamResource,
  TWindowsAccount,
  useListPamAccounts
} from "@app/hooks/api/pam";
import { useManualRotateAccount } from "@app/hooks/api/pam/mutations";
import {
  MetadataFilterEntry,
  MetadataFilterSection
} from "@app/pages/cert-manager/components/MetadataFilterSection";

import { PamAccessAccountModal } from "../../PamAccountsPage/components/PamAccessAccountModal";
import { PamAddAccountModal } from "../../PamAccountsPage/components/PamAddAccountModal";
import { PamDeleteAccountModal } from "../../PamAccountsPage/components/PamDeleteAccountModal";
import { PamRequestAccountAccessModal } from "../../PamAccountsPage/components/PamRequestAccountAccessModal";
import { PamUpdateAccountModal } from "../../PamAccountsPage/components/PamUpdateAccountModal";
import { useAccessAwsIamAccount } from "../../PamAccountsPage/components/useAccessAwsIamAccount";

type Props = {
  resource: TPamResource;
};

const hasAccountType = (resourceType: PamResourceType) =>
  resourceType === PamResourceType.Windows || resourceType === PamResourceType.ActiveDirectory;

const getAccountType = (account: TPamAccount): string | undefined => {
  if (account.resource.resourceType === PamResourceType.Windows) {
    return (account as TWindowsAccount).internalMetadata?.accountType;
  }
  if (account.resource.resourceType === PamResourceType.ActiveDirectory) {
    return (account as TActiveDirectoryAccount).internalMetadata?.accountType;
  }
  return undefined;
};

export const PamResourceAccountsSection = ({ resource }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const { accessAwsIam, loadingAccountId } = useAccessAwsIamAccount();
  const { mutateAsync: checkPolicyMatch } = useCheckPolicyMatch();
  const manualRotate = useManualRotateAccount();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [rotatingAccountIds, setRotatingAccountIds] = useState<Set<string>>(new Set());

  const [pendingMetadataEntries, setPendingMetadataEntries] = useState<MetadataFilterEntry[]>([]);
  const [appliedMetadataEntries, setAppliedMetadataEntries] = useState<MetadataFilterEntry[]>([]);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addAccount",
    "accessAccount",
    "requestAccount",
    "updateAccount",
    "deleteAccount"
  ] as const);

  const isTableFiltered = Boolean(appliedMetadataEntries.some((e) => e.key.trim()));

  const hasFilterChanges = useMemo(() => {
    return JSON.stringify(pendingMetadataEntries) !== JSON.stringify(appliedMetadataEntries);
  }, [pendingMetadataEntries, appliedMetadataEntries]);

  const handleApplyFilters = () => {
    setAppliedMetadataEntries(pendingMetadataEntries);
  };

  const handleClearFilters = () => {
    setPendingMetadataEntries([]);
    setAppliedMetadataEntries([]);
  };

  const hasRotatingAccounts = rotatingAccountIds.size > 0;

  const { data: accountsData, isPending } = useListPamAccounts(
    {
      projectId: projectId!,
      filterResourceIds: resource.id,
      search: debouncedSearch || undefined,
      metadataFilter: appliedMetadataEntries.filter((e) => e.key.trim()).length
        ? appliedMetadataEntries
            .filter((e) => e.key.trim())
            .map((e) => ({
              key: e.key.trim(),
              ...(e.value.trim() ? { value: e.value.trim() } : {})
            }))
        : undefined
    },
    {
      refetchInterval: hasRotatingAccounts ? 3000 : false
    }
  );

  const accounts = accountsData?.accounts || [];

  // Clear optimistic rotating state when server confirms a non-rotating status
  useEffect(() => {
    if (!accountsData?.accounts) return;
    setRotatingAccountIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      [...prev].forEach((id) => {
        const acct = accountsData.accounts.find((a) => a.id === id);
        if (acct) {
          const status = (acct as { rotationStatus?: string | null }).rotationStatus;
          if (status && status !== PamAccountRotationStatus.Rotating) {
            next.delete(id);
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [accountsData]);

  const [copiedAccountId, setCopiedAccountId] = useToggle(false);

  const handleCopyId = useCallback(
    (id: string) => {
      setCopiedAccountId.on();
      navigator.clipboard.writeText(id);

      createNotification({
        text: "Account ID copied to clipboard",
        type: "info"
      });

      setTimeout(() => setCopiedAccountId.off(), 2000);
    },
    [setCopiedAccountId]
  );

  const handleAccountClick = (account: TPamAccount) => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId/accounts/$accountId",
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        resourceType: resource.resourceType,
        resourceId: resource.id,
        accountId: account.id
      }
    });
  };

  const handleRotateAccount = async (accountId: string) => {
    try {
      setRotatingAccountIds((prev) => new Set(prev).add(accountId));
      createNotification({ text: "Account rotation triggered", type: "success" });
      await manualRotate.mutateAsync({ accountId });
    } catch {
      setRotatingAccountIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
      createNotification({ text: "Failed to trigger rotation", type: "error" });
    }
  };

  const accessAccount = async (account: TPamAccount) => {
    const { requiresApproval } = await checkPolicyMatch({
      policyType: ApprovalPolicyType.PamAccess,
      projectId: projectId!,
      inputs: {
        resourceName: resource.name,
        accountName: account.name
      }
    });

    if (requiresApproval) {
      handlePopUpOpen("requestAccount", {
        resourceName: resource.name,
        accountName: account.name,
        accountAccessed: true
      });
      return;
    }

    if (account.resource.resourceType === PamResourceType.AwsIam) {
      accessAwsIam(account);
    } else {
      handlePopUpOpen("accessAccount", { account });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-lg font-medium">Accounts</h3>
          <p className="text-sm text-muted">
            Accounts associated with this resource that can be used for access
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Create}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <Button
              variant="neutral"
              size="sm"
              isDisabled={!isAllowed}
              onClick={() => handlePopUpOpen("addAccount")}
            >
              <PlusIcon />
              Add Account
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="p-4">
        <div className="mb-4 flex gap-2">
          <V2Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search accounts..."
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <V2IconButton
                ariaLabel="Filter accounts"
                variant="plain"
                size="sm"
                className={twMerge(
                  "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                  isTableFiltered && "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </V2IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={2}
              className="max-h-[70vh] thin-scrollbar w-80 overflow-y-auto p-4"
              align="end"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-mineshaft-100">Filters</h3>
                  <span className="text-xs text-bunker-300">
                    {isTableFiltered && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="cursor-pointer text-primary hover:text-primary-600"
                      >
                        Clear filters
                      </button>
                    )}
                  </span>
                </div>

                <MetadataFilterSection
                  entries={pendingMetadataEntries}
                  onChange={setPendingMetadataEntries}
                />

                <div className="pt-2">
                  <V2Button
                    onClick={handleApplyFilters}
                    className="w-full bg-primary font-medium text-black hover:bg-primary-600"
                    size="sm"
                    isDisabled={!hasFilterChanges}
                  >
                    Apply Filters
                  </V2Button>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Account Name</UnstableTableHead>
              {hasAccountType(resource.resourceType) && <UnstableTableHead>Type</UnstableTableHead>}
              <UnstableTableHead>Last Rotated</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {isPending && (
              <UnstableTableRow>
                <UnstableTableCell
                  colSpan={hasAccountType(resource.resourceType) ? 4 : 3}
                  className="text-center text-muted"
                >
                  Loading accounts...
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending && accounts.length === 0 && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={hasAccountType(resource.resourceType) ? 4 : 3}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>
                        {debouncedSearch || isTableFiltered
                          ? "No accounts match your search"
                          : "No accounts found"}
                      </UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {accounts.map((account) => {
              const isAwsIamAccount = resource.resourceType === PamResourceType.AwsIam;
              const serverRotationStatus = !isAwsIamAccount
                ? (account as { rotationStatus?: string | null }).rotationStatus
                : undefined;
              const rotationStatus = rotatingAccountIds.has(account.id)
                ? PamAccountRotationStatus.Rotating
                : serverRotationStatus;
              const lastRotatedAt = !isAwsIamAccount
                ? (account as { lastRotatedAt?: string | null }).lastRotatedAt
                : undefined;
              const lastRotationMessage = !isAwsIamAccount
                ? (account as { lastRotationMessage?: string | null }).lastRotationMessage
                : undefined;

              return (
                <UnstableTableRow
                  key={account.id}
                  className="group cursor-pointer"
                  onClick={() => handleAccountClick(account)}
                >
                  <UnstableTableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{account.name}</span>
                        {account.description && (
                          <span className="line-clamp-1 text-xs text-muted">
                            {account.description}
                          </span>
                        )}
                      </div>
                      {!account.credentialsConfigured && (
                        <Badge variant="warning" className="text-xs">
                          <KeyRoundIcon className="size-3" />
                          <span>No password</span>
                        </Badge>
                      )}
                    </div>
                  </UnstableTableCell>
                  {hasAccountType(resource.resourceType) && (
                    <UnstableTableCell>
                      <span className="capitalize">{getAccountType(account) ?? "-"}</span>
                    </UnstableTableCell>
                  )}
                  <UnstableTableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted">
                        {lastRotatedAt
                          ? formatDistance(new Date(lastRotatedAt), new Date(), {
                              addSuffix: true
                            })
                          : "Never"}
                      </span>
                      {rotationStatus === PamAccountRotationStatus.Failed && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="danger" className="text-xs">
                              Failed
                            </Badge>
                          </TooltipTrigger>
                          {lastRotationMessage && (
                            <TooltipContent className="max-w-sm">
                              {lastRotationMessage}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      )}
                      {rotationStatus === PamAccountRotationStatus.Rotating && (
                        <Badge variant="info" className="animate-pulse text-xs">
                          Rotating
                        </Badge>
                      )}
                      {rotationStatus === PamAccountRotationStatus.Success && (
                        <Badge variant="success" className="text-xs">
                          Success
                        </Badge>
                      )}
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <div className="flex items-center gap-2">
                      {/* Temporarily disable accessing Windows Server accounts */}
                      {/* Disable accessing Active Directory accounts */}
                      {resource.resourceType !== PamResourceType.Windows &&
                        resource.resourceType !== PamResourceType.ActiveDirectory && (
                          <ProjectPermissionCan
                            I={ProjectPermissionPamAccountActions.Access}
                            a={ProjectPermissionSub.PamAccounts}
                          >
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                accessAccount(account);
                              }}
                              isPending={loadingAccountId === account.id}
                              isDisabled={loadingAccountId === account.id}
                            >
                              <LogInIcon />
                              Connect
                            </Button>
                          </ProjectPermissionCan>
                        )}
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton variant="ghost" size="xs">
                            <EllipsisVerticalIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent sideOffset={2} align="end">
                          <UnstableDropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyId(account.id);
                            }}
                          >
                            {copiedAccountId ? (
                              <CheckIcon className="size-4" />
                            ) : (
                              <CopyIcon className="size-4" />
                            )}
                            Copy Account ID
                          </UnstableDropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionPamAccountActions.TriggerRotation}
                            a={ProjectPermissionSub.PamAccounts}
                          >
                            {(isAllowed: boolean) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!isAllowed || manualRotate.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRotateAccount(account.id);
                                }}
                              >
                                <RefreshCwIcon className="size-4" />
                                Rotate Account
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionPamAccountActions.Edit}
                            a={ProjectPermissionSub.PamAccounts}
                          >
                            {(isAllowed: boolean) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("updateAccount", account);
                                }}
                              >
                                <PencilIcon className="size-4" />
                                Edit Account
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionPamAccountActions.Delete}
                            a={ProjectPermissionSub.PamAccounts}
                          >
                            {(isAllowed: boolean) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!isAllowed}
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteAccount", account);
                                }}
                              >
                                <TrashIcon className="size-4" />
                                Delete Account
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </div>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      </div>

      <PamAddAccountModal
        isOpen={popUp.addAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAccount", isOpen)}
        projectId={projectId!}
        currentFolderId={null}
        defaultResource={resource}
      />

      <PamAccessAccountModal
        isOpen={popUp.accessAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("accessAccount", isOpen)}
        account={popUp.accessAccount.data?.account}
        projectId={projectId!}
      />

      <PamRequestAccountAccessModal
        isOpen={popUp.requestAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccount", isOpen)}
        resourceName={popUp.requestAccount.data?.resourceName}
        accountName={popUp.requestAccount.data?.accountName}
        accountAccessed={popUp.requestAccount.data?.accountAccessed}
      />

      <PamUpdateAccountModal
        isOpen={popUp.updateAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateAccount", isOpen)}
        account={popUp.updateAccount.data}
      />

      <PamDeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        account={popUp.deleteAccount.data}
      />
    </div>
  );
};
