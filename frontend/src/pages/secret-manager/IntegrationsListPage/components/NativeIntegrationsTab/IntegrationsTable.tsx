import { useEffect, useMemo, useState } from "react";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faCheck,
  faClock,
  faFilter,
  faMagnifyingGlass,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { RefreshCwIcon, SearchIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  ProviderIcon,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useSyncIntegration } from "@app/hooks/api/integrations/queries";
import { TCloudIntegration, TIntegration } from "@app/hooks/api/integrations/types";

import { getIntegrationDestination } from "./IntegrationDetails";
import { IntegrationRow } from "./IntegrationRow";

type Props = {
  integrations?: TIntegration[];
  cloudIntegrations?: TCloudIntegration[];
  workspaceId: string;
  isLoading?: boolean;
  environments: Array<{ name: string; slug: string; id: string }>;
  onDeleteIntegration: (integration: TIntegration) => void;
};

enum IntegrationsOrderBy {
  App = "app",
  Status = "status",
  SecretPath = "secretPath",
  Environment = "environment",
  Destination = "destination"
}

enum IntegrationStatus {
  Synced = "synced",
  NotSynced = "not-synced",
  PendingSync = "pending-sync"
}

type IntegrationFilters = {
  environmentIds: string[];
  integrations: string[];
  status: IntegrationStatus[];
};

const STATUS_ICON_MAP = {
  [IntegrationStatus.Synced]: { icon: faCheck, className: "text-success" },
  [IntegrationStatus.NotSynced]: { icon: faWarning, className: "text-danger" },
  [IntegrationStatus.PendingSync]: { icon: faClock, className: "text-warning" }
};

export const IntegrationsTable = ({
  integrations = [],
  cloudIntegrations = [],
  workspaceId,
  environments,
  onDeleteIntegration,
  isLoading
}: Props) => {
  const { mutate: syncIntegration } = useSyncIntegration();

  const [filters, setFilters] = useState<IntegrationFilters>({
    status: [],
    integrations: [],
    environmentIds: []
  });

  const cloudIntegrationMap = useMemo(() => {
    return new Map(
      cloudIntegrations.map((cloudIntegration) => [cloudIntegration.slug, cloudIntegration])
    );
  }, [cloudIntegrations]);

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
  } = usePagination<IntegrationsOrderBy>(IntegrationsOrderBy.App, {
    initPerPage: getUserTablePreference("integrationsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("integrationsTable", PreferenceKey.PerPage, newPerPage);
  };

  useEffect(() => {
    if (integrations?.some((integration) => integration.isSynced === false))
      setOrderBy(IntegrationsOrderBy.Status);
  }, []);

  const environmentMap = new Map(environments.map((env) => [env.id, env]));

  const filteredIntegrations = useMemo(
    () =>
      integrations
        .filter((integration) => {
          const { secretPath, envId, isSynced } = integration;

          if (
            filters.status.length &&
            !filters.status.includes(IntegrationStatus.Synced) &&
            isSynced
          )
            return false;
          if (
            filters.status.length &&
            !filters.status.includes(IntegrationStatus.NotSynced) &&
            isSynced === false
          )
            return false;
          if (
            filters.status.length &&
            !filters.status.includes(IntegrationStatus.PendingSync) &&
            typeof isSynced !== "boolean"
          )
            return false;

          if (
            filters.integrations.length &&
            !filters.integrations.includes(integration.integration)
          )
            return false;

          if (filters.environmentIds.length && !filters.environmentIds.includes(envId))
            return false;

          return (
            integration.integration
              .replace("-", " ")
              .toLowerCase()
              .includes(search.trim().toLowerCase()) ||
            secretPath.replace("-", " ").toLowerCase().includes(search.trim().toLowerCase()) ||
            getIntegrationDestination(integration)
              .toLowerCase()
              .includes(search.trim().toLowerCase()) ||
            environmentMap
              .get(envId)
              ?.name.replace("-", " ")
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          );
        })
        .sort((a, b) => {
          const [integrationOne, integrationTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case IntegrationsOrderBy.SecretPath:
              return integrationOne.secretPath
                .toLowerCase()
                .localeCompare(integrationTwo.secretPath.toLowerCase());
            case IntegrationsOrderBy.Environment:
              return (environmentMap.get(integrationOne.envId)?.name ?? "-")
                .toLowerCase()
                .localeCompare(
                  (environmentMap.get(integrationTwo.envId)?.name ?? "-").toLowerCase()
                );
            case IntegrationsOrderBy.Destination:
              return getIntegrationDestination(integrationOne)
                .toLowerCase()
                .localeCompare(getIntegrationDestination(integrationTwo).toLowerCase());
            case IntegrationsOrderBy.Status:
              if (typeof integrationOne.isSynced !== "boolean") return 1; // Place undefined at the end
              if (typeof integrationTwo.isSynced !== "boolean") return -1;

              return Number(integrationOne.isSynced) - Number(integrationTwo.isSynced);
            case IntegrationsOrderBy.App:
            default:
              return integrationOne.integration
                .toLowerCase()
                .localeCompare(integrationTwo.integration.toLowerCase());
          }
        }),
    [integrations, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredIntegrations.length,
    offset,
    setPage
  });

  const handleSort = (column: IntegrationsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: IntegrationsOrderBy) => (orderBy === col ? "" : "opacity-30");

  const getSortDirection = (col: IntegrationsOrderBy): TableSortDirection => {
    if (orderBy !== col) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const getColSortIcon = (col: IntegrationsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered =
    filters.integrations.length || filters.environmentIds.length || filters.status.length;

  return (
    <div>
      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search integrations..."
          />
        </InputGroup>
        <DropdownMenu>
          <Tooltip hoverable delayDuration={50}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label="Environments"
                  variant={isTableFiltered ? "project" : "outline"}
                >
                  <FontAwesomeIcon icon={faFilter} />
                </IconButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Filter Integrations</TooltipContent>
          </Tooltip>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {Object.values(IntegrationStatus).map((status) => (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setFilters((prev) => ({
                    ...prev,
                    status: prev.status.includes(status)
                      ? prev.status.filter((s) => s !== status)
                      : [...prev.status, status]
                  }));
                }}
                key={status}
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    icon={STATUS_ICON_MAP[status].icon}
                    className={STATUS_ICON_MAP[status].className}
                  />
                  <span className="capitalize">{status.replace("-", " ")}</span>
                </div>
                {filters.status.includes(status) && (
                  <FontAwesomeIcon className="ml-auto text-project" icon={faCheckCircle} />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuLabel>Integration</DropdownMenuLabel>
            {[...new Set(integrations.map(({ integration }) => integration))].map((integration) => (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setFilters((prev) => ({
                    ...prev,
                    integrations: prev.integrations.includes(integration)
                      ? prev.integrations.filter((i) => i !== integration)
                      : [...prev.integrations, integration]
                  }));
                }}
                key={integration}
              >
                <div className="flex items-center gap-2">
                  <ProviderIcon
                    alt={`${cloudIntegrationMap.get(integration)!.name} integration`}
                    icon={cloudIntegrationMap.get(integration)!.image}
                    className="h-4 w-4"
                  />
                  <span className="capitalize">{cloudIntegrationMap.get(integration)!.name}</span>
                </div>
                {filters.integrations.includes(integration) && (
                  <FontAwesomeIcon className="ml-auto text-project" icon={faCheckCircle} />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuLabel>Environment</DropdownMenuLabel>
            {environments.map((env) => (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setFilters((prev) => ({
                    ...prev,
                    environmentIds: prev.environmentIds.includes(env.id)
                      ? prev.environmentIds.filter((i) => i !== env.id)
                      : [...prev.environmentIds, env.id]
                  }));
                }}
                key={env.id}
              >
                <span className="capitalize">{env.name}</span>
                {filters.environmentIds.includes(env.id) && (
                  <FontAwesomeIcon className="ml-auto text-project" icon={faCheckCircle} />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isLoading && !filteredIntegrations?.length ? (
        <Empty className="mt-4 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {integrations.length ? <SearchIcon /> : <RefreshCwIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {integrations.length
                ? "No integrations match search..."
                : "This project has no integrations configured"}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table containerClassName="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead
                  className="w-[25%]"
                  sortDirection={getSortDirection(IntegrationsOrderBy.App)}
                  onSortChange={() => handleSort(IntegrationsOrderBy.App)}
                >
                  Integration
                  <FontAwesomeIcon
                    icon={getColSortIcon(IntegrationsOrderBy.App)}
                    className={getClassName(IntegrationsOrderBy.App)}
                  />
                </TableHead>
                <TableHead
                  className="w-1/5"
                  sortDirection={getSortDirection(IntegrationsOrderBy.SecretPath)}
                  onSortChange={() => handleSort(IntegrationsOrderBy.SecretPath)}
                >
                  Source Path
                  <FontAwesomeIcon
                    icon={getColSortIcon(IntegrationsOrderBy.SecretPath)}
                    className={getClassName(IntegrationsOrderBy.SecretPath)}
                  />
                </TableHead>
                <TableHead
                  className="w-1/5"
                  sortDirection={getSortDirection(IntegrationsOrderBy.Environment)}
                  onSortChange={() => handleSort(IntegrationsOrderBy.Environment)}
                >
                  Source Environment
                  <FontAwesomeIcon
                    icon={getColSortIcon(IntegrationsOrderBy.Environment)}
                    className={getClassName(IntegrationsOrderBy.Environment)}
                  />
                </TableHead>
                <TableHead
                  className="w-1/5"
                  sortDirection={getSortDirection(IntegrationsOrderBy.Destination)}
                  onSortChange={() => handleSort(IntegrationsOrderBy.Destination)}
                >
                  Destination
                  <FontAwesomeIcon
                    icon={getColSortIcon(IntegrationsOrderBy.Destination)}
                    className={getClassName(IntegrationsOrderBy.Destination)}
                  />
                </TableHead>
                <TableHead
                  className="w-1/5"
                  sortDirection={getSortDirection(IntegrationsOrderBy.Status)}
                  onSortChange={() => handleSort(IntegrationsOrderBy.Status)}
                >
                  Status
                  <FontAwesomeIcon
                    icon={getColSortIcon(IntegrationsOrderBy.Status)}
                    className={getClassName(IntegrationsOrderBy.Status)}
                  />
                </TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredIntegrations.slice(offset, perPage * page).map((integration) => (
                <IntegrationRow
                  cloudIntegration={cloudIntegrationMap.get(integration.integration)!}
                  key={`integration-${integration.id}`}
                  onManualSyncIntegration={() => {
                    syncIntegration({
                      workspaceId,
                      id: integration.id,
                      lastUsed: integration.lastUsed as string
                    });
                  }}
                  onRemoveIntegration={() => onDeleteIntegration(integration)}
                  integration={integration}
                  environment={environmentMap.get(integration.envId)}
                />
              ))}
            </TableBody>
          </Table>
          {Boolean(filteredIntegrations.length) && (
            <Pagination
              count={filteredIntegrations.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </>
      )}
    </div>
  );
};
