import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faFilter,
  faMagnifyingGlass,
  faPlug,
  faSearch
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
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { AUDIT_LOG_STREAM_PROVIDER_MAP, getProviderUrl } from "@app/helpers/auditLogStreams";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useListAuditLogStreams } from "@app/hooks/api";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { TAuditLogStream } from "@app/hooks/api/types";

import { AuditLogStreamRow } from "./AuditLogStreamRow";
import { DeleteAuditLogStreamModal } from "./DeleteAuditLogStreamModal";
import { EditAuditLogStreamCredentialsModal } from "./EditAuditLogStreamCredentialsModal";

enum LogStreamsOrderBy {
  Provider = "provider",
  Url = "url"
}

type LogStreamFilters = {
  providers: LogProvider[];
};

export const AuditLogStreamTable = () => {
  const { isPending, data: logStreams = [] } = useListAuditLogStreams();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "delete",
    "editCredentials"
  ] as const);

  const [filters, setFilters] = useState<LogStreamFilters>({
    providers: []
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
  } = usePagination<LogStreamsOrderBy>(LogStreamsOrderBy.Provider, {
    initPerPage: getUserTablePreference("logStreamsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("logStreamsTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredLogStreams = useMemo(
    () =>
      logStreams
        .filter((stream) => {
          const { provider } = stream;

          if (filters.providers.length && !filters.providers.includes(provider)) return false;

          const searchValue = search.trim().toLowerCase();

          return AUDIT_LOG_STREAM_PROVIDER_MAP[provider].name.toLowerCase().includes(searchValue);
        })
        .sort((a, b) => {
          const [one, two] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case LogStreamsOrderBy.Url:
              return getProviderUrl(one)
                .toLowerCase()
                .localeCompare(getProviderUrl(two).toLowerCase());
            case LogStreamsOrderBy.Provider:
            default:
              return AUDIT_LOG_STREAM_PROVIDER_MAP[one.provider].name
                .toLowerCase()
                .localeCompare(AUDIT_LOG_STREAM_PROVIDER_MAP[two.provider].name.toLowerCase());
          }
        }),
    [logStreams, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredLogStreams.length,
    offset,
    setPage
  });

  const handleSort = (column: LogStreamsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: LogStreamsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: LogStreamsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.providers.length);

  const handleDelete = (logStream: TAuditLogStream) => handlePopUpOpen("delete", logStream);

  const handleEditCredentials = (logStream: TAuditLogStream) => {
    handlePopUpOpen("editCredentials", logStream);
  };

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search audit log streams..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Log Streams"
              variant="plain"
              size="sm"
              className={twMerge(
                "border-mineshaft-600 bg-mineshaft-800 hover:border-primary/60 hover:bg-primary/10 flex h-10 w-11 items-center justify-center overflow-hidden border p-0 transition-all",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
            <DropdownMenuLabel>Filter by Provider</DropdownMenuLabel>
            {logStreams.length ? (
              [...new Set(logStreams.map(({ provider }) => provider))].map((provider) => {
                const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        providers: prev.providers.includes(provider)
                          ? prev.providers.filter((a) => a !== provider)
                          : [...prev.providers, provider]
                      }));
                    }}
                    key={provider}
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      {providerDetails.image ? (
                        <img
                          alt={providerDetails.name}
                          src={`/images/integrations/${providerDetails.image}`}
                          className="h-4 w-4"
                        />
                      ) : (
                        providerDetails.icon && (
                          <FontAwesomeIcon
                            icon={providerDetails.icon}
                            className="text-mineshaft-300 size-4"
                          />
                        )
                      )}
                      <span>{providerDetails.name}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Providers Configured</DropdownMenuItem>
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
                  Provider
                  <IconButton
                    variant="plain"
                    className={getClassName(LogStreamsOrderBy.Provider)}
                    ariaLabel="sort"
                    onClick={() => handleSort(LogStreamsOrderBy.Provider)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(LogStreamsOrderBy.Provider)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Endpoint URL
                  <IconButton
                    variant="plain"
                    className={getClassName(LogStreamsOrderBy.Url)}
                    ariaLabel="sort"
                    onClick={() => handleSort(LogStreamsOrderBy.Url)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(LogStreamsOrderBy.Url)} />
                  </IconButton>
                </div>
              </Th>

              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && (
              <TableSkeleton
                innerKey="audit-log-streams-table"
                columns={3}
                key="audit-log-streams"
              />
            )}
            {filteredLogStreams.slice(offset, perPage * page).map((stream) => (
              <AuditLogStreamRow
                logStream={stream}
                key={stream.id}
                onDelete={handleDelete}
                onEditCredentials={handleEditCredentials}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredLogStreams.length) && (
          <Pagination
            count={filteredLogStreams.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredLogStreams?.length && (
          <EmptyState
            title={
              logStreams.length
                ? "No log streams match search..."
                : "No log streams have been configured"
            }
            icon={logStreams.length ? faSearch : faPlug}
          />
        )}
      </TableContainer>
      <DeleteAuditLogStreamModal
        isOpen={popUp.delete.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("delete", isOpen)}
        auditLogStream={popUp.delete.data}
      />
      <EditAuditLogStreamCredentialsModal
        isOpen={popUp.editCredentials.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editCredentials", isOpen)}
        auditLogStream={popUp.editCredentials.data}
      />
    </div>
  );
};
