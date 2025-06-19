import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faEllipsisV,
  faFolder,
  faKey,
  faMagnifyingGlass,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetUserWsServiceTokens } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteAPITokenConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

enum TokensOrderBy {
  Name = "name",
  Expiration = "expiration"
}

export const ServiceTokenTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isPending } = useGetUserWsServiceTokens({
    workspaceID: currentWorkspace?.id || ""
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
  } = usePagination<TokensOrderBy>(TokensOrderBy.Name, {
    initPerPage: getUserTablePreference("projectServiceTokens", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectServiceTokens", PreferenceKey.PerPage, newPerPage);
  };

  const filteredTokens = useMemo(
    () =>
      data
        ?.filter((token) => {
          const { name, scopes } = token;

          const searchValue = search.trim().toLowerCase();

          if (name.toLowerCase().includes(searchValue)) {
            return true;
          }

          return scopes.some(
            ({ environment, secretPath }) =>
              environment.toLowerCase().includes(searchValue) ||
              secretPath.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [tokenOne, tokenTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case TokensOrderBy.Expiration:
              if (!tokenOne.expiresAt && !tokenTwo.expiresAt) return 0;
              if (!tokenOne.expiresAt) return 1;
              if (!tokenTwo.expiresAt) return -1;

              return (
                new Date(tokenOne.expiresAt).getTime() - new Date(tokenTwo.expiresAt).getTime()
              );

            case TokensOrderBy.Name:
            default:
              return tokenOne.name.toLowerCase().localeCompare(tokenTwo.name.toLowerCase());
          }
        }) ?? [],
    [data, orderDirection, search, orderBy]
  );

  useResetPageHelper({
    totalCount: filteredTokens.length,
    offset,
    setPage
  });

  const handleSort = (column: TokensOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: TokensOrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: TokensOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search service tokens by name, environment or secret path..."
        className="flex-1"
        containerClassName="mb-4 mt-2"
      />
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(TokensOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(TokensOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(TokensOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th>Environment / Secret Path</Th>
              <Th>
                <div className="flex items-center">
                  Valid Until
                  <IconButton
                    variant="plain"
                    className={getClassName(TokensOrderBy.Expiration)}
                    ariaLabel="sort"
                    onClick={() => handleSort(TokensOrderBy.Expiration)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(TokensOrderBy.Expiration)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" aria-label="button" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="project-service-tokens" />}
            {!isPending &&
              filteredTokens.slice(offset, perPage * page).map((row) => (
                <Tr key={row.id}>
                  <Td>{row.name}</Td>
                  <Td>
                    <div className="flex flex-row flex-wrap gap-1">
                      {row?.scopes.map(({ secretPath, environment }) => (
                        <div
                          key={`${row.id}-${environment}-${secretPath}`}
                          className="inline-flex items-center space-x-1 rounded-md border border-mineshaft-500 p-1 px-2"
                        >
                          <div className="mr-1 border-r border-mineshaft-500 pr-2">
                            {environment}
                          </div>
                          <FontAwesomeIcon icon={faFolder} size="sm" className="text-yellow" />
                          <span className="pl-1">{secretPath}</span>
                        </div>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    {row.expiresAt ? (
                      format(row.expiresAt, "MM/dd/yyyy h:mm:ss aa")
                    ) : (
                      <span className="text-mineshaft-400">N/A</span>
                    )}
                  </Td>
                  <Td>
                    <Tooltip className="max-w-sm text-center" content="Options">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            ariaLabel="Options"
                            colorSchema="secondary"
                            className="w-6"
                            variant="plain"
                          >
                            <FontAwesomeIcon icon={faEllipsisV} />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-[12rem]" sideOffset={2} align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.ServiceTokens}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                icon={<FontAwesomeIcon icon={faTrash} />}
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteAPITokenConfirmation", {
                                    name: row.name,
                                    id: row.id
                                  });
                                }}
                              >
                                Delete Token
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Tooltip>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
        {Boolean(filteredTokens.length) && (
          <Pagination
            count={filteredTokens.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredTokens?.length && (
          <EmptyState
            title={data?.length ? "No service tokens match search..." : "No service tokens found"}
            icon={data?.length ? faSearch : faKey}
          />
        )}
      </TableContainer>
    </div>
  );
};
