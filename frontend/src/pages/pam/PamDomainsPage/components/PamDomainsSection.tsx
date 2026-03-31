import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import { Input } from "@app/components/v2";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  PamResourceOrderBy,
  PamResourceType,
  TActiveDirectoryResource,
  useListPamResources
} from "@app/hooks/api/pam";

import { PamDeleteResourceModal } from "../../PamResourcesPage/components/PamDeleteResourceModal";
import { PamUpdateResourceModal } from "../../PamResourcesPage/components/PamUpdateResourceModal";
import { PamAddDomainModal } from "./PamAddDomainModal";

export const PamDomainsSection = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const projectId = currentProject.id;
  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.DomainsPage.path });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "updateResource",
    "addDomain",
    "deleteResource"
  ] as const);

  const { search: initSearch } = useSearch({
    from: ROUTE_PATHS.Pam.DomainsPage.id
  });

  const { search, debouncedSearch, setSearch, setPage, page, perPage, setPerPage, offset } =
    usePagination(PamResourceOrderBy.Name, {
      initPerPage: getUserTablePreference("pamDomainsTable", PreferenceKey.PerPage, 20),
      initSearch
    });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pamDomainsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isLoading } = useListPamResources({
    projectId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    filterResourceTypes: PamResourceType.ActiveDirectory
  });

  const resources = data?.resources || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => {
            const newSearch = e.target.value;
            setSearch(newSearch);
            navigate({
              search: (prev) => ({ ...prev, search: newSearch || undefined }),
              replace: true
            });
          }}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search domains..."
          className="h-full flex-1"
          containerClassName="h-9"
        />
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isGatewayAllowed) => (
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.PamResources}
            >
              {(isAllowed) => (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="project"
                      onClick={() => handlePopUpOpen("addDomain")}
                      isDisabled={!isAllowed || !isGatewayAllowed}
                    >
                      <PlusIcon />
                      Add Domain
                    </Button>
                  </TooltipTrigger>
                  {!isGatewayAllowed && (
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
            </ProjectPermissionCan>
          )}
        </OrgPermissionCan>
      </div>

      <div className="mt-4">
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Name</UnstableTableHead>
              <UnstableTableHead>Domain</UnstableTableHead>
              <UnstableTableHead>DC Address</UnstableTableHead>
              <UnstableTableHead>LDAPS</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {isLoading && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={4} className="text-center text-muted">
                  Loading domains...
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isLoading && resources.length === 0 && (
              <UnstableTableRow>
                <UnstableTableCell colSpan={4}>
                  <UnstableEmpty className="border-0 bg-transparent py-8 shadow-none">
                    <UnstableEmptyHeader>
                      <UnstableEmptyTitle>
                        {search ? "No domains match search" : "No domains"}
                      </UnstableEmptyTitle>
                    </UnstableEmptyHeader>
                  </UnstableEmpty>
                </UnstableTableCell>
              </UnstableTableRow>
            )}
            {!isLoading &&
              resources.map((resource) => {
                const conn = (resource as TActiveDirectoryResource).connectionDetails;
                return (
                  <UnstableTableRow
                    key={resource.id}
                    className="group cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/pam/$projectId/domains/$resourceType/$resourceId",
                        params: {
                          orgId: currentOrg.id,
                          projectId,
                          resourceType: resource.resourceType,
                          resourceId: resource.id
                        }
                      })
                    }
                  >
                    <UnstableTableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <img
                          alt="Active Directory"
                          src="/images/integrations/ActiveDirectory.png"
                          className="size-5"
                        />
                        {resource.name}
                      </div>
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {conn?.domain || "-"}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {conn?.dcAddress || "-"}
                    </UnstableTableCell>
                    <UnstableTableCell className="text-muted">
                      {conn?.useLdaps ? "Yes" : "No"}
                    </UnstableTableCell>
                  </UnstableTableRow>
                );
              })}
          </UnstableTableBody>
        </UnstableTable>
        {Boolean(totalCount) && !isLoading && (
          <UnstablePagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </div>

      <PamDeleteResourceModal
        isOpen={popUp.deleteResource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteResource", isOpen)}
        resource={popUp.deleteResource.data}
      />
      <PamUpdateResourceModal
        isOpen={popUp.updateResource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateResource", isOpen)}
        resource={popUp.updateResource.data}
      />
      <PamAddDomainModal
        isOpen={popUp.addDomain.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addDomain", isOpen)}
        projectId={projectId}
      />
    </div>
  );
};
