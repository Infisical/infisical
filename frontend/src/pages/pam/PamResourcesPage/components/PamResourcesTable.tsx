import { useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
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

import { PamAddResourceModal } from "./PamAddResourceModal";
import { PamDeleteResourceModal } from "./PamDeleteResourceModal";
import { PamResourceRow } from "./PamResourceRow";
import { PamUpdateResourceModal } from "./PamUpdateResourceModal";

type PamResourceFilter = {
  resourceTypes: PamResourceType[];
};

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

  const [filter, setFilter] = useState<PamResourceFilter>({
    resourceTypes: []
  });

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
    filterResourceTypes: filter.resourceTypes.length ? filter.resourceTypes.join(",") : undefined
  });

  const resources = data?.resources || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const filteredResources = useMemo(
    () =>
      resources.filter((resource) => {
        const { name, resourceType } = resource;

        if (filter.resourceTypes.length && !filter.resourceTypes.includes(resourceType)) {
          return false;
        }

        const searchValue = search.trim().toLowerCase();

        return (
          name.toLowerCase().includes(searchValue) ||
          resourceType.toLowerCase().includes(searchValue)
        );
      }),
    [resources, search, filter]
  );

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

  const isTableFiltered = Boolean(filter.resourceTypes.length);
  const isContentEmpty = !filteredResources.length;
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
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Resource Type</DropdownMenuLabel>
            {Object.entries(PAM_RESOURCE_TYPE_MAP).map(([type, { name, image }]) => {
              const resourceType = type as PamResourceType;
              return (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setFilter((prev) => ({
                      ...prev,
                      resourceTypes: prev.resourceTypes.includes(resourceType)
                        ? prev.resourceTypes.filter((a) => a !== resourceType)
                        : [...prev.resourceTypes, resourceType]
                    }));
                  }}
                  key={resourceType}
                  icon={
                    filter.resourceTypes.includes(resourceType) && (
                      <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  <div className="flex items-center gap-2">
                    <img
                      alt={`${name} resource type`}
                      src={`/images/integrations/${image}`}
                      className="h-4 w-4"
                    />
                    <span>{name}</span>
                  </div>
                </DropdownMenuItem>
              );
            })}
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
              filteredResources.map((resource) => (
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
