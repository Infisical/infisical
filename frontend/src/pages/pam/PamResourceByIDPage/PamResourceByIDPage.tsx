import { useState } from "react";
import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
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
  PamResourceDetailsSection,
  PamResourceRelatedResourcesSection
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const params = useParams({
    strict: false
  }) as { resourceId?: string; resourceType?: string; projectId?: string; orgId?: string };

  const { resourceId, resourceType, projectId } = params;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
              Could not find PAM Resource with ID {resourceId}
            </UnstableEmptyTitle>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      </div>
    );
  }

  const resourceTypeInfo = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

  const handleBack = () => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/resources",
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
        text: `Resource "${resource.name}" deleted successfully`,
        type: "success"
      });
      handleBack();
    } catch (error) {
      console.error("Failed to delete resource:", error);
      createNotification({
        text: "Failed to delete resource",
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
        Resources
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
            <p className="text-sm text-bunker-300">{resourceTypeInfo.name} Resource</p>
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
                    Edit Resource
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
                    Delete Resource
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
          <PamResourceDetailsSection resource={resource} onEdit={() => setIsEditModalOpen(true)} />
          <PamResourceConnectionSection
            resource={resource}
            onEdit={() => setIsEditModalOpen(true)}
          />
        </div>

        {/* Right Column - Tabbed Content */}
        <div className="flex-1">
          <Tabs defaultValue="accounts">
            <TabList>
              <Tab value="accounts">Accounts</Tab>
              {resource.resourceType === PamResourceType.ActiveDirectory && (
                <Tab value="related-resources">Related Resources</Tab>
              )}
            </TabList>
            <TabPanel value="accounts">
              <PamResourceAccountsSection resource={resource} />
            </TabPanel>
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
        title={`Delete Resource ${resource.name}?`}
        onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
        deleteKey={resource.name}
        onDeleteApproved={handleDeleteConfirm}
      />
    </div>
  );
};

export const PamResourceByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>PAM Resource | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
