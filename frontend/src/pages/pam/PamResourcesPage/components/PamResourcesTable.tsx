import { useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faFilter, faMagnifyingGlass, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  FilterableSelect,
  IconButton,
  Input,
  Pagination,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
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
  PAM_RESOURCE_TYPE_MAP,
  PamResourceOrderBy,
  PamResourceType,
  useListPamResources
} from "@app/hooks/api/pam";
import { useSetPamResourceFavorite } from "@app/hooks/api/pam/mutations";
import {
  MetadataFilterEntry,
  MetadataFilterSection
} from "@app/pages/cert-manager/components/MetadataFilterSection";

import { PamAddResourceModal } from "./PamAddResourceModal";
import { PamDeleteResourceModal } from "./PamDeleteResourceModal";
import { PamResourceCard } from "./PamResourceCard";
import { PamUpdateResourceModal } from "./PamUpdateResourceModal";

const ResourceTypeOptionLabel = ({ label, image }: { label: string; image?: string }) => (
  <div className="flex items-center gap-2">
    <img alt={`${label} resource type`} src={`/images/integrations/${image}`} className="h-4 w-4" />
    <span>{label}</span>
  </div>
);

type Props = {
  projectId: string;
};

export const PamResourcesTable = ({ projectId }: Props) => {
  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.ResourcesPage.path });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "updateResource",
    "addResource",
    "deleteResource"
  ] as const);

  const { search: initSearch } = useSearch({
    from: ROUTE_PATHS.Pam.ResourcesPage.id
  });

  const [pendingResourceTypes, setPendingResourceTypes] = useState<PamResourceType[]>([]);
  const [appliedResourceTypes, setAppliedResourceTypes] = useState<PamResourceType[]>([]);
  const [pendingMetadataEntries, setPendingMetadataEntries] = useState<MetadataFilterEntry[]>([]);
  const [appliedMetadataEntries, setAppliedMetadataEntries] = useState<MetadataFilterEntry[]>([]);

  const { search, debouncedSearch, setSearch, setPage, page, perPage, setPerPage, offset } =
    usePagination(PamResourceOrderBy.Name, {
      initPerPage: getUserTablePreference("pamResourcesTable", PreferenceKey.PerPage, 9),
      initSearch
    });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pamResourcesTable", PreferenceKey.PerPage, newPerPage);
  };

  const setFavorite = useSetPamResourceFavorite();

  const { data, isLoading } = useListPamResources({
    projectId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    filterResourceTypes: appliedResourceTypes.length ? appliedResourceTypes.join(",") : undefined,
    metadataFilter: appliedMetadataEntries.filter((e) => e.key.trim()).length
      ? appliedMetadataEntries
          .filter((e) => e.key.trim())
          .map((e) => ({ key: e.key.trim(), ...(e.value.trim() ? { value: e.value.trim() } : {}) }))
      : undefined
  });

  const allResources = data?.resources || [];
  const resources = allResources.filter((r) => r.resourceType !== PamResourceType.ActiveDirectory);
  const totalCount = data?.totalCount || 0;

  const adDomainMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allResources) {
      if (r.resourceType === PamResourceType.ActiveDirectory) {
        map.set(r.id, r.connectionDetails.domain);
      }
    }
    return map;
  }, [allResources]);

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const isTableFiltered = Boolean(
    appliedResourceTypes.length || appliedMetadataEntries.some((e) => e.key.trim())
  );

  const hasFilterChanges = useMemo(() => {
    const typesChanged =
      JSON.stringify([...pendingResourceTypes].sort()) !==
      JSON.stringify([...appliedResourceTypes].sort());
    const metadataChanged =
      JSON.stringify(pendingMetadataEntries) !== JSON.stringify(appliedMetadataEntries);
    return typesChanged || metadataChanged;
  }, [pendingResourceTypes, appliedResourceTypes, pendingMetadataEntries, appliedMetadataEntries]);

  const handleApplyFilters = () => {
    setAppliedResourceTypes(pendingResourceTypes);
    setAppliedMetadataEntries(pendingMetadataEntries);
    setPage(1);
  };

  const handleClearFilters = () => {
    setPendingResourceTypes([]);
    setAppliedResourceTypes([]);
    setPendingMetadataEntries([]);
    setAppliedMetadataEntries([]);
    setPage(1);
  };

  const handleClearResourceTypes = () => {
    setPendingResourceTypes([]);
  };

  // TODO: Temporary - hide Active Directory and RDP from resource type filter
  const TEMPORARILY_HIDDEN_RESOURCE_TYPES = new Set([
    PamResourceType.ActiveDirectory,
    PamResourceType.RDP
  ]);

  const resourceTypeOptions = Object.entries(PAM_RESOURCE_TYPE_MAP)
    .filter(([type]) => !TEMPORARILY_HIDDEN_RESOURCE_TYPES.has(type as PamResourceType))
    .map(([type, { name, image }]) => ({
      value: type as PamResourceType,
      label: name,
      image
    }));

  const isContentEmpty = !resources.length;
  const isSearchEmpty = isContentEmpty && (Boolean(search) || isTableFiltered);

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
          placeholder="Search resources..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter resources"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={2}
            className="max-h-[70vh] thin-scrollbar w-80 overflow-y-auto p-4"
            align="end"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-mineshaft-100">Filters</h3>
                <span className="text-xs text-bunker-300">
                  {isTableFiltered && (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="cursor-pointer text-primary hover:text-primary-600"
                    >
                      Clear filters
                    </button>
                  )}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-bunker-300 uppercase">
                    Resource Type
                  </span>
                  {pendingResourceTypes.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearResourceTypes}
                      className="cursor-pointer text-xs text-primary hover:text-primary-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <FilterableSelect
                  value={pendingResourceTypes.map((type) => ({
                    value: type,
                    label: PAM_RESOURCE_TYPE_MAP[type].name,
                    image: PAM_RESOURCE_TYPE_MAP[type].image
                  }))}
                  onChange={(selectedOptions) => {
                    const types = Array.isArray(selectedOptions)
                      ? selectedOptions.map((opt) => opt.value as PamResourceType)
                      : [];
                    setPendingResourceTypes(types);
                  }}
                  options={resourceTypeOptions}
                  formatOptionLabel={ResourceTypeOptionLabel}
                  placeholder="Select resource types..."
                  className="w-full border-mineshaft-600 bg-mineshaft-700 text-bunker-200"
                  isMulti
                  maxMenuHeight={120}
                />
              </div>

              <MetadataFilterSection
                entries={pendingMetadataEntries}
                onChange={setPendingMetadataEntries}
              />

              <div className="pt-2">
                <Button
                  onClick={handleApplyFilters}
                  className="w-full bg-primary font-medium text-black hover:bg-primary-600"
                  size="sm"
                  isDisabled={!hasFilterChanges}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
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
                    onClick={() => handlePopUpOpen("addResource")}
                    isDisabled={!isAllowed || !isGatewayAllowed}
                  >
                    Add Resource
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
            <PamResourceCard
              key={resource.id}
              resource={resource}
              domainFqdn={
                resource.adServerResourceId
                  ? adDomainMap.get(resource.adServerResourceId)
                  : undefined
              }
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
            title={isSearchEmpty ? "No resources match search" : "No resources"}
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
      <PamAddResourceModal
        isOpen={popUp.addResource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addResource", isOpen)}
        projectId={projectId}
      />
    </div>
  );
};
