import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faMagnifyingGlass,
  faPlug,
  faPlus,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { VariablePermissionCan } from "@app/components/permissions";
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
  Tr
} from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { OrgPermissionSubjects, ProjectPermissionSub } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { TAppConnection, useListAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AddAppConnectionModal } from "./AddAppConnectionModal";
import { AppConnectionRow } from "./AppConnectionRow";
import { DeleteAppConnectionModal } from "./DeleteAppConnectionModal";
import { EditAppConnectionCredentialsModal } from "./EditAppConnectionCredentialsModal";
import { EditAppConnectionDetailsModal } from "./EditAppConnectionDetailsModal";

enum AppConnectionsOrderBy {
  App = "app",
  Name = "name",
  Method = "method",
  ManagedBy = "managed-by"
}

type AppConnectionFilters = {
  apps: AppConnection[];
};

enum View {
  All = "all",
  Scope = "scope"
}

const APP_CONNECTION_VIEW_STORAGE_KEY = "app-connection-view";

type Props = {
  projectId?: string;
  projectType?: ProjectType;
};

export const AppConnectionsTable = ({ projectId, projectType }: Props) => {
  const isProjectView = Boolean(projectId);
  const { isPending, data: appConnections = [] } = useListAppConnections(projectId);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addConnection",
    "deleteConnection",
    "editCredentials",
    "editDetails"
  ] as const);

  const [view, setView] = useState<View>(() => {
    const storedView = localStorage.getItem(APP_CONNECTION_VIEW_STORAGE_KEY) as View | null;

    if (storedView && Object.values(View).includes(storedView)) return storedView;

    return View.Scope;
  });

  const [filters, setFilters] = useState<AppConnectionFilters>({
    apps: []
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
  } = usePagination<AppConnectionsOrderBy>(AppConnectionsOrderBy.App, {
    initPerPage: getUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredAppConnections = useMemo(
    () =>
      appConnections
        .filter((appConnection) => {
          const { app, method, name } = appConnection;

          if (view === View.Scope && !isProjectView && appConnection.projectId) {
            return false;
          }

          if (filters.apps.length && !filters.apps.includes(app)) return false;

          const searchValue = search.trim().toLowerCase();

          return (
            APP_CONNECTION_MAP[app].name.toLowerCase().includes(searchValue) ||
            getAppConnectionMethodDetails(method).name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [connectionOne, connectionTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case AppConnectionsOrderBy.Name:
              return connectionOne.name
                .toLowerCase()
                .localeCompare(connectionTwo.name.toLowerCase());
            case AppConnectionsOrderBy.Method:
              return getAppConnectionMethodDetails(connectionOne.method)
                .name.toLowerCase()
                .localeCompare(
                  getAppConnectionMethodDetails(connectionTwo.method).name.toLowerCase()
                );
            case AppConnectionsOrderBy.ManagedBy:
              if (!connectionOne.project) return 1;
              if (!connectionTwo.project) return -1;

              return connectionOne.project.name
                .toLowerCase()
                .localeCompare(connectionTwo.project.name.toLowerCase());
            case AppConnectionsOrderBy.App:
            default:
              return APP_CONNECTION_MAP[connectionOne.app].name
                .toLowerCase()
                .localeCompare(APP_CONNECTION_MAP[connectionTwo.app].name.toLowerCase());
          }
        }),
    [appConnections, orderDirection, search, orderBy, filters, view]
  );

  useResetPageHelper({
    totalCount: filteredAppConnections.length,
    offset,
    setPage
  });

  const handleSort = (column: AppConnectionsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: AppConnectionsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: AppConnectionsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.apps.length);

  const handleDelete = (appConnection: TAppConnection) =>
    handlePopUpOpen("deleteConnection", appConnection);

  const handleEditCredentials = (appConnection: TAppConnection) =>
    handlePopUpOpen("editCredentials", appConnection);

  const handleEditDetails = (appConnection: TAppConnection) =>
    handlePopUpOpen("editDetails", appConnection);

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">App Connections</p>
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/app-connections/overview" />
          </div>
          <p className="text-sm text-bunker-300">
            Create and configure connections with third-party apps for re-use across your project
            {isProjectView ? "" : "s"}.
          </p>
        </div>
        <VariablePermissionCan
          type={isProjectView ? "project" : "org"}
          I={
            isProjectView
              ? ProjectPermissionAppConnectionActions.Create
              : OrgPermissionAppConnectionActions.Create
          }
          a={
            isProjectView
              ? ProjectPermissionSub.AppConnections
              : OrgPermissionSubjects.AppConnections
          }
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("addConnection")}
              isDisabled={!isAllowed}
            >
              Add Connection
            </Button>
          )}
        </VariablePermissionCan>
      </div>
      <div className="flex gap-2">
        {!isProjectView && (
          <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
            <Button
              variant="outline_bg"
              onClick={() => {
                setView(View.Scope);
                localStorage.setItem(APP_CONNECTION_VIEW_STORAGE_KEY, View.Scope);
              }}
              size="xs"
              className={`${
                view === View.Scope ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-20 rounded border-none hover:bg-mineshaft-600`}
            >
              Organization
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => {
                setView(View.All);
                localStorage.setItem(APP_CONNECTION_VIEW_STORAGE_KEY, View.All);
              }}
              size="xs"
              className={`${
                view === View.All ? "bg-mineshaft-500" : "bg-transparent"
              } min-w-20 rounded border-none hover:bg-mineshaft-600`}
            >
              All
            </Button>
          </div>
        )}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search connections..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Connections"
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
            className="max-h-[70vh] thin-scrollbar overflow-y-auto"
            align="end"
          >
            <DropdownMenuLabel>Filter by Apps</DropdownMenuLabel>
            {appConnections.length ? (
              [...new Set(appConnections.map(({ app }) => app))]
                .sort((a, b) => {
                  return a.toLowerCase().localeCompare(b.toLowerCase());
                })
                .map((app) => (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        apps: prev.apps.includes(app)
                          ? prev.apps.filter((a) => a !== app)
                          : [...prev.apps, app]
                      }));
                    }}
                    key={app}
                    icon={
                      filters.apps.includes(app) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        alt={`${APP_CONNECTION_MAP[app].name} integration`}
                        src={`/images/integrations/${APP_CONNECTION_MAP[app].image}`}
                        className="h-4 w-4"
                      />
                      <span>{APP_CONNECTION_MAP[app].name}</span>
                    </div>
                  </DropdownMenuItem>
                ))
            ) : (
              <DropdownMenuItem isDisabled>No Connections Configured</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/4">
                <div className="flex items-center">
                  App
                  <IconButton
                    variant="plain"
                    className={getClassName(AppConnectionsOrderBy.App)}
                    ariaLabel="sort"
                    onClick={() => handleSort(AppConnectionsOrderBy.App)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(AppConnectionsOrderBy.App)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(AppConnectionsOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(AppConnectionsOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(AppConnectionsOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Method
                  <IconButton
                    variant="plain"
                    className={getClassName(AppConnectionsOrderBy.Method)}
                    ariaLabel="sort"
                    onClick={() => handleSort(AppConnectionsOrderBy.Method)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(AppConnectionsOrderBy.Method)} />
                  </IconButton>
                </div>
              </Th>
              {!isProjectView && (
                <Th>
                  <div className="flex items-center">
                    Managed By
                    <IconButton
                      variant="plain"
                      className={getClassName(AppConnectionsOrderBy.ManagedBy)}
                      ariaLabel="sort"
                      onClick={() => handleSort(AppConnectionsOrderBy.ManagedBy)}
                    >
                      <FontAwesomeIcon icon={getColSortIcon(AppConnectionsOrderBy.ManagedBy)} />
                    </IconButton>
                  </div>
                </Th>
              )}
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && (
              <TableSkeleton innerKey="app-connections-table" columns={4} key="app-connections" />
            )}
            {filteredAppConnections.slice(offset, perPage * page).map((connection) => (
              <AppConnectionRow
                appConnection={connection}
                key={connection.id}
                onDelete={handleDelete}
                onEditCredentials={handleEditCredentials}
                onEditDetails={handleEditDetails}
                isProjectView={isProjectView}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredAppConnections.length) && (
          <Pagination
            count={filteredAppConnections.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredAppConnections?.length && (
          <EmptyState
            title={
              appConnections.length
                ? "No App Connections match search..."
                : "No App Connections have been configured"
            }
            icon={appConnections.length ? faSearch : faPlug}
          />
        )}
      </TableContainer>
      <DeleteAppConnectionModal
        isOpen={popUp.deleteConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteConnection", isOpen)}
        appConnection={popUp.deleteConnection.data}
      />
      <EditAppConnectionCredentialsModal
        isOpen={popUp.editCredentials.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editCredentials", isOpen)}
        appConnection={popUp.editCredentials.data}
      />
      <EditAppConnectionDetailsModal
        isOpen={popUp.editDetails.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
        appConnection={popUp.editDetails.data}
      />
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
        projectId={projectId}
        projectType={projectType}
      />
    </div>
  );
};
