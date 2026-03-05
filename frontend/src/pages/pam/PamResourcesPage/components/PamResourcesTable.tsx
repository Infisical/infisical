import { useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faFilter,
  faMagnifyingGlass,
  faPlus,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
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
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tooltip,
  Tr
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
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamResourceOrderBy,
  PamResourceType,
  useListPamResources
} from "@app/hooks/api/pam";
import {
  MetadataFilterEntry,
  MetadataFilterSection
} from "@app/pages/cert-manager/components/MetadataFilterSection";

import { PamAddResourceModal } from "./PamAddResourceModal";
import { PamDeleteResourceModal } from "./PamDeleteResourceModal";
import { PamResourceRow } from "./PamResourceRow";
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

  const {
    search,
    debouncedSearch,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection,
    orderBy,
    setOrderDirection,
    setOrderBy
  } = usePagination<PamResourceOrderBy>(PamResourceOrderBy.Name, {
    initPerPage: getUserTablePreference("pamResourcesTable", PreferenceKey.PerPage, 20),
    initSearch
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pamResourcesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isLoading } = useListPamResources({
    projectId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    orderBy,
    orderDirection,
    filterResourceTypes: appliedResourceTypes.length ? appliedResourceTypes.join(",") : undefined,
    metadataFilter: appliedMetadataEntries.filter((e) => e.key.trim()).length
      ? appliedMetadataEntries
          .filter((e) => e.key.trim())
          .map((e) => ({ key: e.key.trim(), ...(e.value.trim() ? { value: e.value.trim() } : {}) }))
      : undefined
  });

  const resources = data?.resources || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const handleSort = (column: PamResourceOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: PamResourceOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: PamResourceOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

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

  const resourceTypeOptions = Object.entries(PAM_RESOURCE_TYPE_MAP).map(
    ([type, { name, image }]) => ({
      value: type as PamResourceType,
      label: name,
      image
    })
  );

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
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>
                <div className="flex items-center">
                  Resource
                  <IconButton
                    variant="plain"
                    className={getClassName(PamResourceOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(PamResourceOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(PamResourceOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="pam-resources" />}
            {!isLoading &&
              resources.map((resource) => (
                <PamResourceRow
                  key={resource.id}
                  resource={resource}
                  onUpdate={(e) => handlePopUpOpen("updateResource", e)}
                  onDelete={(e) => handlePopUpOpen("deleteResource", e)}
                  search={search.trim().toLowerCase()}
                />
              ))}
          </TBody>
        </Table>
        {Boolean(totalCount) && !isLoading && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isLoading && isContentEmpty && (
          <EmptyState
            title={isSearchEmpty ? "No resources match search" : "No resources"}
            icon={isSearchEmpty ? faSearch : faCircleXmark}
          />
        )}
      </TableContainer>
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
