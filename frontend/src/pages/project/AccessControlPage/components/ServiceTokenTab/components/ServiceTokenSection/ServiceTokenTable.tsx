import { useMemo } from "react";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  FolderIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
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
  const { currentProject } = useProject();
  const { data, isPending } = useGetUserWsServiceTokens({
    workspaceID: currentProject?.id || ""
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

  return (
    <div>
      <div className="mb-4">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search service tokens by name, environment or secret path..."
          />
        </InputGroup>
      </div>
      {!isPending && !filteredTokens?.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {search ? "No service tokens match search" : "No service tokens found"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {search ? "Adjust your search criteria." : "Create a token to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead onClick={() => handleSort(TokensOrderBy.Name)}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === TokensOrderBy.Name &&
                        "rotate-180",
                      orderBy !== TokensOrderBy.Name && "opacity-30"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead>Environment / Secret Path</UnstableTableHead>
                <UnstableTableHead onClick={() => handleSort(TokensOrderBy.Expiration)}>
                  Valid Until
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === TokensOrderBy.Expiration &&
                        "rotate-180",
                      orderBy !== TokensOrderBy.Expiration && "opacity-30"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <UnstableTableRow key={`skeleton-${i + 1}`}>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-4" />
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              {!isPending &&
                filteredTokens.slice(offset, perPage * page).map((row) => (
                  <UnstableTableRow key={row.id}>
                    <UnstableTableCell isTruncatable>{row.name}</UnstableTableCell>
                    <UnstableTableCell>
                      <div className="flex flex-row flex-wrap gap-1">
                        {row?.scopes.map(({ secretPath, environment }) => (
                          <Badge key={`${row.id}-${environment}-${secretPath}`} variant="neutral">
                            <span className="border-r border-border pr-1.5">{environment}</span>
                            <FolderIcon className="text-yellow" />
                            <span>{secretPath}</span>
                          </Badge>
                        ))}
                      </div>
                    </UnstableTableCell>
                    <UnstableTableCell>
                      {row.expiresAt ? (
                        format(row.expiresAt, "MMM d, yyyy h:mm aa")
                      ) : (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontalIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent sideOffset={2} align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.ServiceTokens}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteAPITokenConfirmation", {
                                    name: row.name,
                                    id: row.id
                                  });
                                }}
                              >
                                <TrashIcon />
                                Delete Token
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
            </UnstableTableBody>
          </UnstableTable>
          {Boolean(filteredTokens.length) && (
            <UnstablePagination
              count={filteredTokens.length}
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
