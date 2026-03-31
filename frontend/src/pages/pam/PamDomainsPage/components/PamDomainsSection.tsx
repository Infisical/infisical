import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faMagnifyingGlass, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import { Button, EmptyState, Input, Pagination, Tooltip } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
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
import { PamResourceOrderBy, PamResourceType, useListPamResources } from "@app/hooks/api/pam";
import { useSetPamResourceFavorite } from "@app/hooks/api/pam/mutations";

import { PamDeleteResourceModal } from "../../PamResourcesPage/components/PamDeleteResourceModal";
import { PamUpdateResourceModal } from "../../PamResourcesPage/components/PamUpdateResourceModal";
import { PamAddDomainModal } from "./PamAddDomainModal";
import { PamDomainCard } from "./PamDomainCard";

export const PamDomainsSection = () => {
  const { currentProject } = useProject();
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
      initPerPage: getUserTablePreference("pamDomainsTable", PreferenceKey.PerPage, 9),
      initSearch
    });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pamDomainsTable", PreferenceKey.PerPage, newPerPage);
  };

  const setFavorite = useSetPamResourceFavorite();

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

  const isContentEmpty = !resources.length;
  const isSearchEmpty = isContentEmpty && Boolean(search);

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
          className="flex-1"
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
                <Tooltip
                  isDisabled={isGatewayAllowed}
                  content="Restricted access. You don't have permission to attach gateways to resources."
                >
                  <Button
                    colorSchema="secondary"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => handlePopUpOpen("addDomain")}
                    isDisabled={!isAllowed || !isGatewayAllowed}
                  >
                    Add Domain
                  </Button>
                </Tooltip>
              )}
            </ProjectPermissionCan>
          )}
        </OrgPermissionCan>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {isLoading &&
          Array.from({ length: 9 }).map((_, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={`skeleton-${i}`}
              className="h-[88px] animate-pulse rounded-sm border border-mineshaft-600 bg-mineshaft-800"
            />
          ))}
        {!isLoading &&
          resources.map((resource) => (
            <PamDomainCard
              key={resource.id}
              resource={resource}
              onUpdate={(e) => handlePopUpOpen("updateResource", e)}
              onDelete={(e) => handlePopUpOpen("deleteResource", e)}
              onToggleFavorite={(e) =>
                setFavorite.mutate({ projectId, resourceId: e.id, isFavorite: !e.isFavorite })
              }
              search={search.trim().toLowerCase()}
            />
          ))}
        {Boolean(totalCount) && !isLoading && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
            perPageList={[9, 18, 48, 99]}
            className="col-span-full justify-start! border-transparent bg-transparent pl-2"
          />
        )}
        {!isLoading && isContentEmpty && (
          <EmptyState
            title={isSearchEmpty ? "No domains match search" : "No domains"}
            icon={isSearchEmpty ? faSearch : faCircleXmark}
            className="col-span-full rounded border border-mineshaft-500"
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
