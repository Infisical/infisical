import { useState } from "react";
import { Helmet } from "react-helmet";
import { faBan, faChevronLeft, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
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
  PamResourceDetailsSection
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
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title={`Could not find PAM Resource with ID ${resourceId}`}
        />
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" colorSchema="secondary">
                <FontAwesomeIcon icon={faEllipsisV} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    onClick={() => setIsEditModalOpen(true)}
                    isDisabled={!isAllowed}
                  >
                    Edit Resource
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.PamResources}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="text-red-500"
                    isDisabled={!isAllowed}
                  >
                    Delete Resource
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
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
            </TabList>
            <TabPanel value="accounts">
              <PamResourceAccountsSection resource={resource} />
            </TabPanel>
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
