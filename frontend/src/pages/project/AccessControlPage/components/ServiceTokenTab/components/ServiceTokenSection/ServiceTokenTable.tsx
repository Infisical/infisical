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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {search ? "No service tokens match search" : "No service tokens found"}
            </EmptyTitle>
            <EmptyDescription>
              {search ? "Adjust your search criteria." : "Create a token to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead onClick={() => handleSort(TokensOrderBy.Name)}>
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
                </TableHead>
                <TableHead>Environment / Secret Path</TableHead>
                <TableHead onClick={() => handleSort(TokensOrderBy.Expiration)}>
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
                </TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
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
                filteredTokens.slice(offset, perPage * page).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell isTruncatable>{row.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-row flex-wrap gap-1">
                        {row?.scopes.map(({ secretPath, environment }) => (
                          <Badge key={`${row.id}-${environment}-${secretPath}`} variant="neutral">
                            <span className="border-r border-border pr-1.5">{environment}</span>
                            <FolderIcon className="text-yellow" />
                            <span>{secretPath}</span>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.expiresAt ? (
                        format(row.expiresAt, "MMM d, yyyy h:mm aa")
                      ) : (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.ServiceTokens}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
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
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
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
        </>
      )}
    </div>
  );
};
