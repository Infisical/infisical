import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { BanIcon, EllipsisVerticalIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import {
  PAM_DOMAIN_TYPE_MAP,
  PamDomainType,
  useDeletePamDomain,
  useGetPamDomainById
} from "@app/hooks/api/pamDomain";

import {
  PamDomainAccountsSection,
  PamDomainConnectionSection,
  PamDomainDetailsSection,
  PamDomainMetadataSection,
  PamDomainRelatedResourcesSection,
  PamUpdateDomainModal
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({
    strict: false
  }) as { domainId?: string; domainType?: string; projectId?: string; orgId?: string };

  const { domainId, domainType, projectId } = params;

  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const handleTabChange = (tab: string) => {
    navigate({
      to: ".",
      search: { selectedTab: tab }
    });
  };

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: domain, isPending } = useGetPamDomainById(domainType as PamDomainType, domainId, {
    enabled: Boolean(domainId) && Boolean(domainType)
  });

  const deleteDomain = useDeletePamDomain();

  if (isPending) {
    return <UnstablePageLoader />;
  }

  if (!domain) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <UnstableEmpty className="max-w-2xl">
          <UnstableEmptyHeader>
            <BanIcon className="size-8 text-muted" />
            <UnstableEmptyTitle className="text-muted">
              Could not find PAM Domain with ID {domainId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const domainTypeInfo = PAM_DOMAIN_TYPE_MAP[domain.domainType];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/domains",
      params: { orgId: currentOrg.id, projectId: projectId! }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!domain) return;

    try {
      await deleteDomain.mutateAsync({
        domainId: domain.id,
        domainType: domain.domainType
      });
      createNotification({
        text: `Domain "${domain.name}" deleted successfully`,
        type: "success"
      });
      handleBack();
    } catch (error) {
      console.error("Failed to delete domain:", error);
      createNotification({
        text: "Failed to delete domain",
        type: "error"
      });
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
        Domains
      </button>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-mineshaft-700">
            <img
              alt={domainTypeInfo.name}
              src={`/images/integrations/${domainTypeInfo.image}`}
              className="size-6"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-mineshaft-100">{domain.name}</h1>
            <p className="text-sm text-bunker-300">{domainTypeInfo.name} Domain</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <EllipsisVerticalIcon />
              </Button>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.PamDomains}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsEditModalOpen(true)}
                    isDisabled={!isAllowed}
                  >
                    Edit Domain
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.PamDomains}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsDeleteModalOpen(true)}
                    variant="danger"
                    isDisabled={!isAllowed}
                  >
                    Delete Domain
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
          <PamDomainDetailsSection domain={domain} onEdit={() => setIsEditModalOpen(true)} />
          <PamDomainConnectionSection domain={domain} onEdit={() => setIsEditModalOpen(true)} />
          <PamDomainMetadataSection domain={domain} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="min-w-0 flex-1">
          <Tabs value={selectedTab || "accounts"} onValueChange={handleTabChange}>
            <TabList>
              <Tab value="accounts">Accounts</Tab>
              <Tab value="related-resources">Resources</Tab>
            </TabList>
            <TabPanel value="accounts">
              <PamDomainAccountsSection domain={domain} />
            </TabPanel>
            <TabPanel value="related-resources">
              <PamDomainRelatedResourcesSection domain={domain} />
            </TabPanel>
          </Tabs>
        </div>
      </div>

      <PamUpdateDomainModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        domain={domain}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete Domain "${domain.name}"?`}
        subTitle="This will permanently remove this domain. Associated resources will be unlinked but not deleted."
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey={domain.name}
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};

export const PamDomainByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>PAM Domain | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
