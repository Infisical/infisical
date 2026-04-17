import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ClockAlertIcon,
  ClockIcon,
  FilterIcon,
  MoreHorizontalIcon,
  SearchIcon,
  UserXIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject, useUser } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetProjectRoles, useGetWorkspaceUsers } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeMember"]>, data?: object) => void;
};

enum MembersOrderBy {
  Name = "firstName",
  Email = "email"
}

type Filter = {
  roles: string[];
};

export const MembersTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const { user } = useUser();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>({
    roles: []
  });
  const filterRoles = useMemo(() => filter.roles, [filter.roles]);

  const userId = user?.id || "";
  const projectId = currentProject?.id || "";
  const { data: projectRoles } = useGetProjectRoles(projectId);

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    setOrderBy,
    setOrderDirection,
    toggleOrderDirection
  } = usePagination<MembersOrderBy>(MembersOrderBy.Name, {
    initPerPage: getUserTablePreference("projectMembersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: members = [], isPending: isMembersLoading } = useGetWorkspaceUsers(
    projectId,
    undefined,
    filterRoles
  );

  const filteredUsers = useMemo(
    () =>
      members
        ?.filter(
          ({ user: u, inviteEmail }) =>
            u?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.username?.toLowerCase().includes(search.toLowerCase()) ||
            u?.email?.toLowerCase().includes(search.toLowerCase()) ||
            inviteEmail?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
          const [memberOne, memberTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          let valueOne: string;
          let valueTwo: string;

          switch (orderBy) {
            case MembersOrderBy.Email:
              valueOne = memberOne.user.email || memberOne.inviteEmail;
              valueTwo = memberTwo.user.email || memberTwo.inviteEmail;
              break;
            case MembersOrderBy.Name:
            default:
              valueOne = memberOne.user.firstName;
              valueTwo = memberTwo.user.firstName;
          }

          if (!valueOne) return 1;
          if (!valueTwo) return -1;

          return valueOne.toLowerCase().localeCompare(valueTwo.toLowerCase());
        }),
    [members, search, orderDirection, orderBy]
  );

  useResetPageHelper({
    totalCount: filteredUsers.length,
    offset,
    setPage
  });

  const handleSort = (column: MembersOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const isTableFiltered = Boolean(filter.roles.length);

  const handleRoleToggle = useCallback(
    (roleSlug: string) =>
      setFilter((state) => {
        const roles = state.roles || [];

        if (roles.includes(roleSlug)) {
          return { ...state, roles: roles.filter((role) => role !== roleSlug) };
        }
        return { ...state, roles: [...roles, roleSlug] };
      }),
    []
  );

  const filteredUsersPage = filteredUsers.slice(offset, perPage * page);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project users..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant={isTableFiltered ? "project" : "outline"}>
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by Project Role</DropdownMenuLabel>
            {projectRoles?.map(({ id, slug, name }) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={filter.roles.includes(slug)}
                onClick={(e) => {
                  e.preventDefault();
                  handleRoleToggle(slug);
                  setPage(1);
                }}
              >
                {name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isMembersLoading && !filteredUsers?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {search || isTableFiltered
                ? "No project users match search"
                : "No project users found"}
            </EmptyTitle>
            <EmptyDescription>
              {search || isTableFiltered
                ? "Adjust your search or filter criteria."
                : "Add users to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3" onClick={() => handleSort(MembersOrderBy.Name)}>
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === MembersOrderBy.Name &&
                        "rotate-180",
                      orderBy !== MembersOrderBy.Name && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead className="w-1/3" onClick={() => handleSort(MembersOrderBy.Email)}>
                  Email
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === MembersOrderBy.Email &&
                        "rotate-180",
                      orderBy !== MembersOrderBy.Email && "opacity-30"
                    )}
                  />
                </TableHead>
                <TableHead>Project Role</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isMembersLoading &&
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
              {!isMembersLoading &&
                filteredUsersPage.map((projectMember) => {
                  const { user: u, inviteEmail, id: membershipId, roles } = projectMember;
                  const name =
                    u.firstName || u.lastName ? `${u.firstName} ${u.lastName || ""}` : null;
                  const email = u?.email || inviteEmail;

                  return (
                    <TableRow
                      key={`membership-${membershipId}`}
                      className="group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") {
                          navigate({
                            to: `${getProjectBaseURL(currentProject.type)}/members/$membershipId`,
                            params: {
                              projectId,
                              membershipId
                            }
                          });
                        }
                      }}
                      onClick={() =>
                        navigate({
                          to: `${getProjectBaseURL(currentProject.type)}/members/$membershipId`,
                          params: {
                            projectId,
                            membershipId
                          }
                        })
                      }
                    >
                      <TableCell isTruncatable>
                        {name ?? <span className="text-muted">&mdash;</span>}
                      </TableCell>
                      <TableCell isTruncatable>{email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {roles
                            .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                            .map(
                              ({
                                role,
                                customRoleName,
                                id,
                                isTemporary,
                                temporaryAccessEndTime
                              }) => {
                                const isExpired =
                                  new Date() > new Date(temporaryAccessEndTime || ("" as string));
                                return (
                                  <Badge key={id} variant={isExpired ? "danger" : "neutral"}>
                                    <span className="capitalize">
                                      {formatProjectRoleName(role, customRoleName)}
                                    </span>
                                    {isTemporary && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {isExpired ? "Access expired" : "Temporary access"}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </Badge>
                                );
                              }
                            )}
                          {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                            <Popover>
                              <Tooltip>
                                <TooltipTrigger className="flex h-4 items-center">
                                  <PopoverTrigger asChild>
                                    <Badge variant="neutral" asChild>
                                      <button type="button" onClick={(e) => e.stopPropagation()}>
                                        +{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}
                                      </button>
                                    </Badge>
                                  </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>Click to view additional roles</TooltipContent>
                              </Tooltip>
                              <PopoverContent
                                side="right"
                                className="flex w-auto max-w-sm flex-wrap gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {roles
                                  .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                  .map(
                                    ({
                                      role,
                                      customRoleName,
                                      id,
                                      isTemporary,
                                      temporaryAccessEndTime
                                    }) => {
                                      const isExpired =
                                        new Date() >
                                        new Date(temporaryAccessEndTime || ("" as string));
                                      return (
                                        <Badge
                                          key={id}
                                          className="z-10"
                                          variant={isExpired ? "danger" : "neutral"}
                                        >
                                          <span className="capitalize">
                                            {formatProjectRoleName(role, customRoleName)}
                                          </span>
                                          {isTemporary && (
                                            <Tooltip>
                                              <TooltipTrigger tabIndex={-1}>
                                                {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                {isExpired ? "Access expired" : "Temporary access"}
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                        </Badge>
                                      );
                                    }
                                  )}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="xs"
                                  isDisabled={userId === u?.id}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontalIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            {userId === u?.id && (
                              <TooltipContent side="left">
                                You cannot modify your own membership
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Delete}
                              a={ProjectPermissionSub.Member}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!isAllowed}
                                  onClick={(evt) => {
                                    evt.preventDefault();
                                    evt.stopPropagation();
                                    handlePopUpOpen("removeMember", {
                                      username: u.username
                                    });
                                  }}
                                >
                                  <UserXIcon />
                                  Remove User From Project
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {Boolean(filteredUsers.length) && (
            <Pagination
              count={filteredUsers.length}
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
