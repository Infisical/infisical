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
  PAM_RESOURCE_TYPE_MAP,
  PamResourceType,
  useDeletePamResource,
  useGetPamResourceById
} from "@app/hooks/api/pam";

import { PamUpdateResourceModal } from "../PamResourcesPage/components/PamUpdateResourceModal";
import {
  PamResourceAccountsSection,
  PamResourceConnectionSection,
  PamResourceDependenciesSection,
  PamResourceDetailsSection,
  PamResourceMetadataSection,
  PamResourceRelatedResourcesSection,
  PamRotationPolicyModal
} from "./components";

type Variant = "resource" | "domain";

const VARIANT_CONFIG: Record<
  Variant,
  {
    backLabel: string;
    backRoute: string;
    entityLabel: string;
    subtitle: (typeName: string) => string;
    title: string;
  }
> = {
  resource: {
    backLabel: "Resources",
    backRoute: "/organizations/$orgId/projects/pam/$projectId/resources",
    entityLabel: "Resource",
    subtitle: (typeName) => `${typeName} Resource`,
    title: "PAM Resource | Infisical"
  },
  domain: {
    backLabel: "Domains",
    backRoute: "/organizations/$orgId/projects/pam/$projectId/domains",
    entityLabel: "Domain",
    subtitle: () => "Active Directory Domain",
    title: "PAM Domain | Infisical"
  }
};

const PageContent = ({ variant = "resource" }: { variant?: Variant }) => {
  const config = VARIANT_CONFIG[variant];
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({
    strict: false
  }) as { resourceId?: string; resourceType?: string; projectId?: string; orgId?: string };

  const { resourceId, resourceType, projectId } = params;

  const tabRoute =
    variant === "domain"
      ? "/organizations/$orgId/projects/pam/$projectId/domains/$resourceType/$resourceId"
      : "/organizations/$orgId/projects/pam/$projectId/resources/$resourceType/$resourceId";

  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const handleTabChange = (tab: string) => {
    navigate({
      to: tabRoute,
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        orgId: currentOrg.id,
        projectId: projectId!,
        resourceType: resourceType!,
        resourceId: resourceId!
      }
    });
  };

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRotationPolicyModalOpen, setIsRotationPolicyModalOpen] = useState(false);

  const { data: resource, isPending } = useGetPamResourceById(
    resourceType as PamResourceType,
    resourceId,
    {
      enabled: Boolean(resourceId) && Boolean(resourceType)
    }
  );

  const deleteResource = useDeletePamResource();

  if (isPending) {
    return <UnstablePageLoader />;
  }

  if (!resource) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <UnstableEmpty className="max-w-2xl">
          <UnstableEmptyHeader>
            <BanIcon className="size-8 text-muted" />
            <UnstableEmptyTitle className="text-muted">
              Could not find {config.entityLabel.toLowerCase()} with ID {resourceId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

  const handleBack = () => {
    navigate({
      to: config.backRoute,
      params: { orgId: currentOrg.id, projectId: projectId! }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!resource) return;

    try {
      await deleteResource.mutateAsync({
        resourceId: resource.id,
        resourceType: resource.resourceType
      });
      createNotification({
        text: `${config.entityLabel} "${resource.name}" deleted successfully`,
        type: "success"
      });
      handleBack();
    } catch (error) {
      console.error(`Failed to delete ${config.entityLabel.toLowerCase()}:`, error);
      createNotification({
        text: `Failed to delete ${config.entityLabel.toLowerCase()}`,
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
        {config.backLabel}
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
            <h1 className="text-2xl font-semibold text-mineshaft-100">{resource.name}</h1>
            <p className="text-sm text-bunker-300">{config.subtitle(resourceTypeInfo.name)}</p>
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
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsEditModalOpen(true)}
                    isDisabled={!isAllowed}
                  >
                    Edit {config.entityLabel}
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    onClick={() => setIsDeleteModalOpen(true)}
                    variant="danger"
                    isDisabled={!isAllowed}
                  >
                    Delete {config.entityLabel}
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
          <PamResourceDetailsSection resource={resource} onEdit={() => setIsEditModalOpen(true)} />
          <PamResourceConnectionSection
            resource={resource}
            onEdit={() => setIsEditModalOpen(true)}
          />
          <PamResourceMetadataSection resource={resource} />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="min-w-0 flex-1">
          <Tabs value={selectedTab} onValueChange={handleTabChange}>
            <TabList>
              <Tab value="accounts">Accounts</Tab>
              {resource.resourceType === PamResourceType.Windows && (
                <Tab value="dependencies">Dependencies</Tab>
              )}
              {resource.resourceType === PamResourceType.ActiveDirectory && (
                <Tab value="related-resources">Resources</Tab>
              )}
            </TabList>
            <TabPanel value="accounts">
              <PamResourceAccountsSection resource={resource} />
            </TabPanel>
            {resource.resourceType === PamResourceType.Windows && (
              <TabPanel value="dependencies">
                <PamResourceDependenciesSection resource={resource} />
              </TabPanel>
            )}
            {resource.resourceType === PamResourceType.ActiveDirectory && (
              <TabPanel value="related-resources">
                <PamResourceRelatedResourcesSection resource={resource} />
              </TabPanel>
            )}
          </Tabs>
        </div>
      </div>

      <PamUpdateResourceModal
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        resource={resource}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        title={`Delete ${config.entityLabel} ${resource.name}?`}
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey={resource.name}
        onDeleteApproved={handleDeleteConfirm}
      />

      <PamRotationPolicyModal
        isOpen={isRotationPolicyModalOpen}
        onOpenChange={setIsRotationPolicyModalOpen}
        resource={resource}
      />
    </div>
  );
};

export const PamResourceByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>{VARIANT_CONFIG.resource.title}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent variant="resource" />
    </>
  );
};

export const PamDomainByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>{VARIANT_CONFIG.domain.title}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent variant="domain" />
    </>
  );
};
