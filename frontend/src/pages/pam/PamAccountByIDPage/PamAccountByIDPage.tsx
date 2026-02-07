import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { BanIcon, EllipsisVerticalIcon, LogInIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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
import { PAM_RESOURCE_TYPE_MAP, PamResourceType, useGetPamAccountById } from "@app/hooks/api/pam";

import { PamAccessAccountModal } from "../PamAccountsPage/components/PamAccessAccountModal";
import { PamDeleteAccountModal } from "../PamAccountsPage/components/PamDeleteAccountModal";
import { PamRequestAccountAccessModal } from "../PamAccountsPage/components/PamRequestAccountAccessModal";
import { PamUpdateAccountModal } from "../PamAccountsPage/components/PamUpdateAccountModal";
import { useAccessAwsIamAccount } from "../PamAccountsPage/components/useAccessAwsIamAccount";
import {
  PamAccountCredentialsSection,
  PamAccountDetailsSection,
  PamAccountResourcesSection
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
  };

  const { accountId, projectId, resourceType, resourceId } = params;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "accessAccount",
    "requestAccount",
    "deleteAccount"
  ] as const);

  const { accessAwsIam, isPending: isAwsAccessPending } = useAccessAwsIamAccount();
  const { mutateAsync: checkPolicyMatch } = useCheckPolicyMatch();

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

  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[account.resource.resourceType];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId",
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        resourceType: resourceType!,
        resourceId: resourceId!
      }
    });
  };

  const handleAccess = async () => {
    const fullAccountPath = `/${account.name}`;

    const { requiresApproval } = await checkPolicyMatch({
      policyType: ApprovalPolicyType.PamAccess,
      projectId: projectId!,
      inputs: {
        accountPath: fullAccountPath,
        resourceName: account.resource.name,
        accountName: account.name
      }
    });

    if (requiresApproval) {
      handlePopUpOpen("requestAccount", {
        accountPath: fullAccountPath,
        resourceName: account.resource.name,
        accountName: account.name,
        accountAccessed: true
      });
      return;
    }

    if (account.resource.resourceType === PamResourceType.AwsIam) {
      accessAwsIam(account, fullAccountPath);
    } else {
      handlePopUpOpen("accessAccount", { account, accountPath: undefined });
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
        Back to resource
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <img
              alt={resourceTypeInfo.name}
              src={`/images/integrations/${resourceTypeInfo.image}`}
              className="size-6"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{account.name}</h1>
            <p className="text-sm text-bunker-300">
              {resourceTypeInfo.name} Account on {account.resource.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProjectPermissionCan
            I={ProjectPermissionPamAccountActions.Access}
            a={ProjectPermissionSub.PamAccounts}
          >
            <Button variant="neutral" onClick={handleAccess} isPending={isAwsAccessPending}>
              <LogInIcon />
              Access
            </Button>
          </ProjectPermissionCan>
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
                    Edit Account
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
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
        <div className="flex w-80 flex-col gap-4">
          <PamAccountDetailsSection account={account} onEdit={() => setIsEditModalOpen(true)} />
          <PamAccountCredentialsSection account={account} onEdit={() => setIsEditModalOpen(true)} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="flex-1">
          <Tabs defaultValue="resources">
            <TabList>
              <Tab value="resources">Resources</Tab>
            </TabList>
            <TabPanel value="resources">
              <PamAccountResourcesSection account={account} onAccessResource={handleAccess} />
            </TabPanel>
          </Tabs>
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
        accountPath={popUp.requestAccount.data?.accountPath}
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
