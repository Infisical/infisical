import { useEffect, useMemo, useState } from "react";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faCheck,
  faClock,
  faFilter,
  faMagnifyingGlass,
  faRotate,
  faSearch,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
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
  [IntegrationStatus.Synced]: { icon: faCheck, className: "text-green" },
  [IntegrationStatus.NotSynced]: { icon: faWarning, className: "text-red" },
  [IntegrationStatus.PendingSync]: { icon: faClock, className: "text-yellow" }
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

  const getClassName = (col: IntegrationsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: IntegrationsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered =
    filters.integrations.length || filters.environmentIds.length || filters.status.length;

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search integrations..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Environments"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <Tooltip content="Filter Integrations" className="mb-2">
                <FontAwesomeIcon icon={faFilter} />
              </Tooltip>
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
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
                icon={
                  filters.status.includes(status) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    icon={STATUS_ICON_MAP[status].icon}
                    className={STATUS_ICON_MAP[status].className}
                  />
                  <span className="capitalize">{status.replace("-", " ")}</span>
                </div>
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
                icon={
                  filters.integrations.includes(integration) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <img
                    alt={`${cloudIntegrationMap.get(integration)!.name} integration`}
                    src={`/images/integrations/${cloudIntegrationMap.get(integration)!.image}`}
                    className="h-4 w-4"
                  />
                  <span className="capitalize">{cloudIntegrationMap.get(integration)!.name}</span>
                </div>
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
                icon={
                  filters.environmentIds.includes(env.id) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <span className="capitalize">{env.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-[25%]">
                <div className="flex items-center">
                  Integration
                  <IconButton
                    variant="plain"
                    className={getClassName(IntegrationsOrderBy.App)}
                    ariaLabel="sort"
                    onClick={() => handleSort(IntegrationsOrderBy.App)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(IntegrationsOrderBy.App)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Source Path
                  <IconButton
                    variant="plain"
                    className={getClassName(IntegrationsOrderBy.SecretPath)}
                    ariaLabel="sort"
                    onClick={() => handleSort(IntegrationsOrderBy.SecretPath)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(IntegrationsOrderBy.SecretPath)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Source Environment
                  <IconButton
                    variant="plain"
                    className={getClassName(IntegrationsOrderBy.Environment)}
                    ariaLabel="sort"
                    onClick={() => handleSort(IntegrationsOrderBy.Environment)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(IntegrationsOrderBy.Environment)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Destination
                  <IconButton
                    variant="plain"
                    className={getClassName(IntegrationsOrderBy.Destination)}
                    ariaLabel="sort"
                    onClick={() => handleSort(IntegrationsOrderBy.Destination)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(IntegrationsOrderBy.Destination)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5">
                <div className="flex items-center">
                  Status
                  <IconButton
                    variant="plain"
                    className={getClassName(IntegrationsOrderBy.Status)}
                    ariaLabel="sort"
                    onClick={() => handleSort(IntegrationsOrderBy.Status)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(IntegrationsOrderBy.Status)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
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
          </TBody>
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
        {!isLoading && !filteredIntegrations?.length && (
          <EmptyState
            title={
              integrations.length
                ? "No integrations match search..."
                : "This project has no integrations configured"
            }
            icon={integrations.length ? faSearch : faRotate}
          />
        )}
      </TableContainer>
    </div>
  );
};
