import { useCallback } from "react";
import {
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faPlus,
  faRightToBracket,
  faRotate,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { format, formatDistance } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { ApprovalPolicyType, useCheckPolicyMatch } from "@app/hooks/api/approvalPolicies";
import { PamResourceType, TPamAccount, TPamResource, useListPamAccounts } from "@app/hooks/api/pam";

import { PamAccessAccountModal } from "../../PamAccountsPage/components/PamAccessAccountModal";
import { PamAddAccountModal } from "../../PamAccountsPage/components/PamAddAccountModal";
import { PamDeleteAccountModal } from "../../PamAccountsPage/components/PamDeleteAccountModal";
import { PamRequestAccountAccessModal } from "../../PamAccountsPage/components/PamRequestAccountAccessModal";
import { PamUpdateAccountModal } from "../../PamAccountsPage/components/PamUpdateAccountModal";
import { useAccessAwsIamAccount } from "../../PamAccountsPage/components/useAccessAwsIamAccount";

type Props = {
  resource: TPamResource;
};

export const PamResourceAccountsSection = ({ resource }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;

  const { accessAwsIam, loadingAccountId } = useAccessAwsIamAccount();
  const { mutateAsync: checkPolicyMatch } = useCheckPolicyMatch();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addAccount",
    "accessAccount",
    "requestAccount",
    "updateAccount",
    "deleteAccount"
  ] as const);

  const { data: accountsData, isPending } = useListPamAccounts({
    projectId: projectId!,
    filterResourceIds: resource.id
  });

  const accounts = accountsData?.accounts || [];
  const folderPaths = accountsData?.folderPaths || {};

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
      to: "/organizations/$orgId/projects/pam/$projectId/accounts/$accountId",
      params: { orgId: currentOrg.id, projectId: projectId!, accountId: account.id }
    });
  };

  const accessAccount = async (account: TPamAccount) => {
    let fullAccountPath = `/${account.name}`;
    const folderPath = account.folderId ? folderPaths[account.folderId] : undefined;
    if (folderPath) {
      fullAccountPath = `${folderPath}/${account.name}`;
    }

    const { requiresApproval } = await checkPolicyMatch({
      policyType: ApprovalPolicyType.PamAccess,
      projectId: projectId!,
      inputs: {
        accountPath: fullAccountPath
      }
    });

    if (requiresApproval) {
      handlePopUpOpen("requestAccount", { accountPath: fullAccountPath, accountAccessed: true });
      return;
    }

    if (account.resource.resourceType === PamResourceType.AwsIam) {
      accessAwsIam(account, fullAccountPath);
    } else {
      handlePopUpOpen("accessAccount", { account, accountPath: folderPath });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900">
      <div className="flex items-center justify-between border-b border-mineshaft-600 px-4 py-3">
        <div>
          <h3 className="text-lg font-medium text-mineshaft-100">Accounts</h3>
          <p className="text-sm text-bunker-300">
            Accounts associated with this resource that can be used for access
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Create}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <Button
              variant="outline_bg"
              size="sm"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              isDisabled={!isAllowed}
              onClick={() => handlePopUpOpen("addAccount")}
            >
              Add Account
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="p-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Account Name</Th>
                <Th>Rotation</Th>
                <Th>Created</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && (
                <Tr>
                  <Td colSpan={4} className="text-center text-mineshaft-400">
                    Loading accounts...
                  </Td>
                </Tr>
              )}
              {!isPending && accounts.length === 0 && (
                <Tr>
                  <Td colSpan={4}>
                    <EmptyState title="No accounts found" className="py-8" />
                  </Td>
                </Tr>
              )}
              {accounts.map((account) => {
                const isAwsIamAccount = resource.resourceType === PamResourceType.AwsIam;
                const rotationEnabled = !isAwsIamAccount
                  ? (account as { rotationEnabled?: boolean }).rotationEnabled
                  : undefined;
                const rotationStatus = !isAwsIamAccount
                  ? (account as { rotationStatus?: string | null }).rotationStatus
                  : undefined;
                const lastRotatedAt = !isAwsIamAccount
                  ? (account as { lastRotatedAt?: string | null }).lastRotatedAt
                  : undefined;
                const lastRotationMessage = !isAwsIamAccount
                  ? (account as { lastRotationMessage?: string | null }).lastRotationMessage
                  : undefined;

                return (
                  <Tr
                    key={account.id}
                    className="group cursor-pointer hover:bg-mineshaft-700"
                    onClick={() => handleAccountClick(account)}
                  >
                    <Td>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-mineshaft-100">{account.name}</span>
                          {lastRotatedAt && (
                            <Tooltip
                              className="max-w-sm text-center"
                              isDisabled={!lastRotationMessage}
                              content={lastRotationMessage}
                            >
                              <Badge
                                variant={rotationStatus === "failed" ? "danger" : "success"}
                                className="text-xs"
                              >
                                <FontAwesomeIcon icon={faRotate} />
                                <span>
                                  Rotated {formatDistance(new Date(), new Date(lastRotatedAt))} ago
                                </span>
                              </Badge>
                            </Tooltip>
                          )}
                        </div>
                        {account.description && (
                          <Tooltip content={account.description}>
                            <span className="line-clamp-1 text-xs text-mineshaft-400">
                              {account.description}
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {isAwsIamAccount ? (
                        <Badge variant="neutral" className="text-xs">
                          N/A
                        </Badge>
                      ) : (
                        <Badge
                          variant={rotationEnabled ? "success" : "neutral"}
                          className="text-xs"
                        >
                          {rotationEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-mineshaft-300">
                      {format(new Date(account.createdAt), "yyyy-MM-dd")}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <ProjectPermissionCan
                          I={ProjectPermissionPamAccountActions.Access}
                          a={ProjectPermissionSub.PamAccounts}
                        >
                          <Button
                            colorSchema="secondary"
                            leftIcon={<FontAwesomeIcon icon={faRightToBracket} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              accessAccount(account);
                            }}
                            size="xs"
                            isLoading={loadingAccountId === account.id}
                            isDisabled={loadingAccountId === account.id}
                          >
                            Connect
                          </Button>
                        </ProjectPermissionCan>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              ariaLabel="Options"
                              colorSchema="secondary"
                              className="w-6"
                              variant="plain"
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem
                              icon={<FontAwesomeIcon icon={copiedAccountId ? faCheck : faCopy} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyId(account.id);
                              }}
                            >
                              Copy Account ID
                            </DropdownMenuItem>
                            <ProjectPermissionCan
                              I={ProjectPermissionPamAccountActions.Edit}
                              a={ProjectPermissionSub.PamAccounts}
                            >
                              {(isAllowed: boolean) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faEdit} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("updateAccount", account);
                                  }}
                                >
                                  Edit Account
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionPamAccountActions.Delete}
                              a={ProjectPermissionSub.PamAccounts}
                            >
                              {(isAllowed: boolean) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteAccount", account);
                                  }}
                                >
                                  Delete Account
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </div>

      <PamAddAccountModal
        isOpen={popUp.addAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAccount", isOpen)}
        projectId={projectId!}
        currentFolderId={null}
      />

      <PamAccessAccountModal
        isOpen={popUp.accessAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("accessAccount", isOpen)}
        account={popUp.accessAccount.data?.account}
        accountPath={popUp.accessAccount.data?.accountPath}
        projectId={projectId!}
      />

      <PamRequestAccountAccessModal
        isOpen={popUp.requestAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccount", isOpen)}
        accountPath={popUp.requestAccount.data?.accountPath}
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
