import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  BanIcon,
  EllipsisVerticalIcon,
  LogInIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePageLoader
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType, useCheckPolicyMatch } from "@app/hooks/api/approvalPolicies";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamAccountRotationStatus,
  PamResourceType,
  TPamAccount,
  useGetPamAccountById
} from "@app/hooks/api/pam";
import { useManualRotateAccount } from "@app/hooks/api/pam/mutations";
import { pamKeys } from "@app/hooks/api/pam/queries";
import { PAM_DOMAIN_TYPE_MAP, PamDomainType } from "@app/hooks/api/pamDomain";

import { PamAccessAccountModal } from "../PamAccountsPage/components/PamAccessAccountModal";
import { PamDeleteAccountModal } from "../PamAccountsPage/components/PamDeleteAccountModal";
import { PamRequestAccountAccessModal } from "../PamAccountsPage/components/PamRequestAccountAccessModal";
import { PamUpdateAccountModal } from "../PamAccountsPage/components/PamUpdateAccountModal";
import { useAccessAwsIamAccount } from "../PamAccountsPage/components/useAccessAwsIamAccount";
import {
  PamAccountCredentialsSection,
  PamAccountDependenciesSection,
  PamAccountDetailsSection,
  PamAccountMetadataSection,
  PamAccountPropertiesSection,
  PamSelectResourceModal
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({
    strict: false
  }) as {
    accountId?: string;
    projectId?: string;
    orgId?: string;
    resourceType?: string;
    resourceId?: string;
    domainType?: string;
    domainId?: string;
  };

  const { accountId, projectId, resourceType, resourceId, domainType, domainId } = params;
  const isDomainAccount = !!domainId;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "accessAccount",
    "requestAccount",
    "deleteAccount",
    "selectResource"
  ] as const);

  const queryClient = useQueryClient();
  const { accessAwsIam, isPending: isAwsAccessPending } = useAccessAwsIamAccount();
  const { mutateAsync: checkPolicyMatch } = useCheckPolicyMatch();
  const rotateAccount = useManualRotateAccount();

  const { data: account, isPending } = useGetPamAccountById(accountId);

  if (isPending) {
    return <UnstablePageLoader />;
  }

  if (!account) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <UnstableEmpty className="max-w-2xl">
          <UnstableEmptyHeader>
            <BanIcon className="size-8 text-muted" />
            <UnstableEmptyTitle className="text-muted">
              Could not find PAM Account with ID {accountId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const resourceTypeInfo = account.resource
    ? PAM_RESOURCE_TYPE_MAP[account.resource.resourceType]
    : null;

  const domainTypeInfo = account.domain
    ? PAM_DOMAIN_TYPE_MAP[account.domain.domainType as PamDomainType]
    : null;

  const parentTypeInfo = resourceTypeInfo || domainTypeInfo;

  const handleBack = () => {
    if (isDomainAccount) {
      navigate({
        to: "/organizations/$orgId/projects/pam/$projectId/domains/$domainType/$domainId",
        params: {
          orgId: currentOrg.id,
          projectId: projectId!,
          domainType: domainType!,
          domainId: domainId!
        }
      });
    } else {
      navigate({
        to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
        params: {
          orgId: currentOrg.id,
          projectId: projectId!,
          resourceType: resourceType!,
          resourceId: resourceId!
        }
      });
    }
  };

  const handleAccess = async () => {
    if (isDomainAccount && account.domain) {
      handlePopUpOpen("selectResource");
      return;
    }

    const { requiresApproval } = await checkPolicyMatch({
      policyType: ApprovalPolicyType.PamAccess,
      projectId: projectId!,
      inputs: {
        resourceName: account.resource?.name ?? "",
        accountName: account.name
      }
    });

    if (requiresApproval) {
      handlePopUpOpen("requestAccount", {
        resourceName: account.resource?.name ?? "",
        accountName: account.name,
        accountAccessed: true
      });
      return;
    }

    if (account.resource?.resourceType === PamResourceType.AwsIam) {
      accessAwsIam(account);
    } else {
      handlePopUpOpen("accessAccount", { account });
    }
  };

  const handleRotate = async () => {
    // Optimistically show rotating status immediately
    queryClient.setQueryData(pamKeys.getAccount(account.id), (old: TPamAccount | undefined) =>
      old ? { ...old, rotationStatus: PamAccountRotationStatus.Rotating } : old
    );

    try {
      const updatedAccount = await rotateAccount.mutateAsync({ accountId: account.id });

      if (updatedAccount.rotationStatus === PamAccountRotationStatus.Success) {
        createNotification({ text: "Credential rotation completed successfully", type: "success" });
      } else if (updatedAccount.rotationStatus === PamAccountRotationStatus.PartialSuccess) {
        createNotification({
          text: "Credential rotation completed with warnings",
          type: "warning"
        });
      } else if (updatedAccount.rotationStatus === PamAccountRotationStatus.Failed) {
        createNotification({ text: "Credential rotation failed", type: "error" });
      }
    } catch {
      // Revert optimistic update on failure
      queryClient.invalidateQueries({ queryKey: pamKeys.getAccount(account.id) });
      createNotification({ text: "Failed to trigger rotation", type: "error" });
    }
  };

  return (
    <div className="container mx-auto flex max-w-7xl flex-col px-6 py-6 text-mineshaft-50">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-1 text-sm text-bunker-300 hover:text-primary-400"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
        {isDomainAccount ? "Back to domain" : "Back to resource"}
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {parentTypeInfo && (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
              <img
                alt={parentTypeInfo.name}
                src={`/images/integrations/${parentTypeInfo.image}`}
                className="size-6"
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{account.name}</h1>
            <p className="text-sm text-bunker-300">
              {account.domain
                ? `${account.domain.domainType === "active-directory" ? "Active Directory" : account.domain.domainType} Account on ${account.domain.name}`
                : `${resourceTypeInfo?.name ?? ""} Account on ${account.resource?.name ?? ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* TODO: Disabled for Windows Server and Active Directory accounts until RDP is implemented */}
          {!isDomainAccount && account.resource?.resourceType !== PamResourceType.Windows && (
            <ProjectPermissionCan
              I={ProjectPermissionPamAccountActions.Access}
              a={ProjectPermissionSub.PamAccounts}
            >
              <Button variant="neutral" onClick={handleAccess} isPending={isAwsAccessPending}>
                <LogInIcon />
                Access
              </Button>
            </ProjectPermissionCan>
          )}
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <EllipsisVerticalIcon />
              </Button>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionPamAccountActions.Edit}
                a={ProjectPermissionSub.PamAccounts}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsEditModalOpen(true)}
                    isDisabled={!isAllowed}
                  >
                    <PencilIcon className="size-3.5" />
                    Edit Account
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
              {account.resource?.rotationCredentialsConfigured && (
                <ProjectPermissionCan
                  I={ProjectPermissionPamAccountActions.TriggerRotation}
                  a={ProjectPermissionSub.PamAccounts}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      onClick={handleRotate}
                      isDisabled={
                        !isAllowed || account.rotationStatus === PamAccountRotationStatus.Rotating
                      }
                    >
                      <RefreshCwIcon className="size-3.5" />
                      Rotate Account
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              )}
              <ProjectPermissionCan
                I={ProjectPermissionPamAccountActions.Delete}
                a={ProjectPermissionSub.PamAccounts}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => handlePopUpOpen("deleteAccount", account)}
                    variant="danger"
                    isDisabled={!isAllowed}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete Account
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left Column */}
        <div className="flex w-80 shrink-0 flex-col gap-4">
          <PamAccountDetailsSection account={account} onEdit={() => setIsEditModalOpen(true)} />
          <PamAccountCredentialsSection account={account} onEdit={() => setIsEditModalOpen(true)} />
          <PamAccountPropertiesSection account={account} />
          <PamAccountMetadataSection account={account} />
        </div>

        <div className="min-w-0 flex-1">
          <PamAccountDependenciesSection account={account} />
        </div>
      </div>

      <PamUpdateAccountModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        account={account}
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

      <PamDeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        account={popUp.deleteAccount.data}
        onDeleted={handleBack}
      />

      {isDomainAccount && account.domain && (
        <PamSelectResourceModal
          isOpen={popUp.selectResource.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("selectResource", isOpen)}
          domainType={account.domain.domainType}
          domainId={account.domain.id}
          onSelect={(resource) => {
            handlePopUpOpen("accessAccount", { account, resource });
          }}
        />
      )}
    </div>
  );
};

export const PamAccountByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>PAM Account | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
