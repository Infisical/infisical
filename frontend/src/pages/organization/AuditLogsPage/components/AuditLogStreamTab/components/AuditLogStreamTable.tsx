import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChevronDownIcon, FilterIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { AUDIT_LOG_STREAM_PROVIDER_MAP, getProviderUrl } from "@app/helpers/auditLogStreams";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper, useScopeVariant } from "@app/hooks";
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
  const scopeVariant = useScopeVariant();

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

  const renderSortIcon = (col: LogStreamsOrderBy) =>
    orderBy === col ? (
      <ChevronDownIcon
        className={twMerge(
          "ml-1 size-3.5 transition-transform",
          orderDirection === OrderByDirection.DESC && "rotate-180"
        )}
      />
    ) : null;

  const isTableFiltered = Boolean(filters.providers.length);

  const handleDelete = (logStream: TAuditLogStream) => handlePopUpOpen("delete", logStream);

  const handleEditCredentials = (logStream: TAuditLogStream) => {
    handlePopUpOpen("editCredentials", logStream);
  };

  const visibleLogStreams = filteredLogStreams.slice(offset, perPage * page);

  return (
    <>
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit log streams..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Filter Log Streams"
              variant={isTableFiltered ? scopeVariant : "outline"}
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={2}
            className="max-h-[70vh] thin-scrollbar overflow-y-auto"
            align="end"
          >
            <DropdownMenuLabel>Filter by Provider</DropdownMenuLabel>
            {logStreams.length ? (
              [...new Set(logStreams.map(({ provider }) => provider))].map((provider) => {
                const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

                return (
                  <DropdownMenuCheckboxItem
                    key={provider}
                    checked={filters.providers.includes(provider)}
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        providers: prev.providers.includes(provider)
                          ? prev.providers.filter((a) => a !== provider)
                          : [...prev.providers, provider]
                      }));
                    }}
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
                            className="size-4 text-muted"
                          />
                        )
                      )}
                      <span>{providerDetails.name}</span>
                    </div>
                  </DropdownMenuCheckboxItem>
                );
              })
            ) : (
              <DropdownMenuLabel className="font-normal text-muted">
                No Providers Configured
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        {!isPending && !filteredLogStreams.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {logStreams.length
                  ? "No log streams match search"
                  : "No log streams have been configured"}
              </EmptyTitle>
              <EmptyDescription>
                {logStreams.length
                  ? "Adjust your search or filters to view log streams."
                  : "Add a log stream to send audit logs to an external destination."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort(LogStreamsOrderBy.Provider)}
                  >
                    Provider
                    {renderSortIcon(LogStreamsOrderBy.Provider)}
                  </TableHead>
                  <TableHead
                    className="w-full cursor-pointer"
                    onClick={() => handleSort(LogStreamsOrderBy.Url)}
                  >
                    Endpoint URL
                    {renderSortIcon(LogStreamsOrderBy.Url)}
                  </TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  Array.from({ length: 5 }).map((_, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`log-stream-skeleton-${i + 1}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isPending &&
                  visibleLogStreams.map((stream) => (
                    <AuditLogStreamRow
                      logStream={stream}
                      key={stream.id}
                      onDelete={handleDelete}
                      onEditCredentials={handleEditCredentials}
                    />
                  ))}
              </TableBody>
            </Table>
            {!isPending && (
              <Pagination
                count={filteredLogStreams.length}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={handlePerPageChange}
              />
            )}
          </>
        )}
      </div>
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
    </>
  );
};
