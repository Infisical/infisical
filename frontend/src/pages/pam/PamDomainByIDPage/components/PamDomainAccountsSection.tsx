import { useCallback, useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Input as V2Input } from "@app/components/v2";
import {
  Badge,
  Button,
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
import { TPamAccount, useListPamAccounts } from "@app/hooks/api/pam";
import { TPamDomain } from "@app/hooks/api/pamDomain";

import { PamDeleteAccountModal } from "../../PamAccountsPage/components/PamDeleteAccountModal";
import { PamUpdateAccountModal } from "../../PamAccountsPage/components/PamUpdateAccountModal";
import { PamAddDomainAccountModal } from "./PamAddDomainAccountModal";

type Props = {
  domain: TPamDomain;
};

export const PamDomainAccountsSection = ({ domain }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addAccount",
    "updateAccount",
    "deleteAccount"
  ] as const);

  const [copiedAccountId, setCopiedAccountId] = useToggle(false);

  const handleCopyId = useCallback(
    (id: string) => {
      setCopiedAccountId.on();
      navigator.clipboard.writeText(id);
      createNotification({ text: "Account ID copied to clipboard", type: "info" });
      setTimeout(() => setCopiedAccountId.off(), 2000);
    },
    [setCopiedAccountId]
  );

  const { data: accountsData, isPending } = useListPamAccounts({
    projectId: projectId || "",
    search: debouncedSearch || undefined,
    filterDomainIds: domain.id
  });

  const accounts = accountsData?.accounts || [];

  const handleAccountClick = (accountId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/domains/$domainType/$domainId/accounts/$accountId",
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        domainType: domain.domainType,
        domainId: domain.id,
        accountId
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-container">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-lg font-medium">Domain Accounts</h3>
          <p className="text-sm text-muted">
            Accounts associated with this domain that can be used for access
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
            className="h-full flex-1"
            containerClassName="h-9"
          />
        </div>

        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Account Name</UnstableTableHead>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Created</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {isPending && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={4} className="text-center text-muted">
                  Loading accounts...
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending && accounts.length === 0 && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={4}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>
                        {search ? "No accounts match search" : "No accounts"}
                      </UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isPending &&
              accounts.map((account) => {
                const internalMeta = (account as Record<string, unknown>).internalMetadata as
                  | Record<string, string>
                  | undefined;
                return (
                  <UnstableTableRow
                    key={account.id}
                    className="group cursor-pointer"
                    onClick={() => handleAccountClick(account.id)}
                  >
                    <UnstableTableCell>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{account.name}</span>
                        {!account.credentialsConfigured && (
                          <Badge variant="warning" className="text-xs">
                            <KeyRoundIcon className="size-3" />
                            <span>No password</span>
                          </Badge>
                        )}
                      </div>
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted capitalize">
                      {internalMeta?.accountType || "-"}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                    </UnstableTableCell>
                  </UnstableTableRow>
                );
              })}
          </UnstableTableBody>
        </UnstableTable>
      </div>

      <PamAddDomainAccountModal
        isOpen={popUp.addAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAccount", isOpen)}
        projectId={projectId!}
        domain={domain}
      />

      <PamUpdateAccountModal
        isOpen={popUp.updateAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateAccount", isOpen)}
        account={popUp.updateAccount.data as TPamAccount}
      />

      <PamDeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        account={popUp.deleteAccount.data as TPamAccount}
      />
    </div>
  );
};
