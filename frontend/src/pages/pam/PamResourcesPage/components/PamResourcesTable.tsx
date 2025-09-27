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
  TBody,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType, TPamResource } from "@app/hooks/api/pam";

import { PamAddResourceModal } from "./PamAddResourceModal";
import { PamDeleteResourceModal } from "./PamDeleteResourceModal";
import { PamResourceRow } from "./PamResourceRow";
import { PamUpdateResourceModal } from "./PamUpdateResourceModal";

enum OrderBy {
  Name = "name"
}

type Filters = {
  resourceType: PamResourceType[];
};

type Props = {
  projectId: string;
  resources: TPamResource[];
};

export const PamResourcesTable = ({ projectId, resources }: Props) => {
  const { subscription } = useSubscription();

  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.ResourcesPage.path });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "updateResource",
    "addResource",
    "deleteResource"
  ] as const);

  const { search: initSearch } = useSearch({
    from: ROUTE_PATHS.Pam.ResourcesPage.id
  });

  const [filters, setFilters] = useState<Filters>({
    resourceType: []
  });

  const {
    search,
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
  } = usePagination<OrderBy>(OrderBy.Name, { initPerPage: 20, initSearch });

  const filteredResources = useMemo(
    () =>
      resources
        .filter((resource) => {
          const { name, resourceType } = resource;

          if (filters.resourceType.length && !filters.resourceType.includes(resourceType)) {
            return false;
          }

          const searchValue = search.trim().toLowerCase();

          const { name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

          return (
            name.toLowerCase().includes(searchValue) ||
            resourceTypeName.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [one, two] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case OrderBy.Name:
            default:
              return one.name.toLowerCase().localeCompare(two.name.toLowerCase());
          }
        }),
    [resources, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const currentPageData = useMemo(
    () => filteredResources.slice(offset, perPage * page),
    [filteredResources, offset, perPage, page]
  );

  const handleSort = (column: OrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: OrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: OrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.resourceType.length);
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
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
            <DropdownMenuLabel>Resource Type</DropdownMenuLabel>
            {resources.length ? (
              [...new Set(resources.map(({ resourceType }) => resourceType))].map((type) => {
                const { name, image } = PAM_RESOURCE_TYPE_MAP[type];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        resourceType: prev.resourceType.includes(type)
                          ? prev.resourceType.filter((a) => a !== type)
                          : [...prev.resourceType, type]
                      }));
                    }}
                    key={type}
                    icon={
                      filters.resourceType.includes(type) && (
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
              })
            ) : (
              <DropdownMenuItem isDisabled>No Resources</DropdownMenuItem>
            )}
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
                    isDisabled={
                      !isAllowed || !isGatewayAllowed || !subscription.gateway || !subscription.pam
                    }
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
                    className={getClassName(OrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {currentPageData.map((resource) => (
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
        {Boolean(filteredResources.length) && (
          <Pagination
            count={filteredResources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {isContentEmpty && (
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
