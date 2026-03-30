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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuLabel,
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
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant={isTableFiltered ? "project" : "outline"}>
              <FilterIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuLabel>Filter by Project Role</UnstableDropdownMenuLabel>
            {projectRoles?.map(({ id, slug, name }) => (
              <UnstableDropdownMenuCheckboxItem
                key={id}
                checked={filter.roles.includes(slug)}
                onClick={(e) => {
                  e.preventDefault();
                  handleRoleToggle(slug);
                  setPage(1);
                }}
              >
                {name}
              </UnstableDropdownMenuCheckboxItem>
            ))}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </div>
      {!isMembersLoading && !filteredUsers?.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {search || isTableFiltered
                ? "No project users match search"
                : "No project users found"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {search || isTableFiltered
                ? "Adjust your search or filter criteria."
                : "Add users to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead
                  className="w-1/3"
                  onClick={() => handleSort(MembersOrderBy.Name)}
                >
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
                </UnstableTableHead>
                <UnstableTableHead
                  className="w-1/3"
                  onClick={() => handleSort(MembersOrderBy.Email)}
                >
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
                </UnstableTableHead>
                <UnstableTableHead>Project Role</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isMembersLoading &&
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
              {!isMembersLoading &&
                filteredUsersPage.map((projectMember) => {
                  const { user: u, inviteEmail, id: membershipId, roles } = projectMember;
                  const name =
                    u.firstName || u.lastName ? `${u.firstName} ${u.lastName || ""}` : null;
                  const email = u?.email || inviteEmail;

                  return (
                    <UnstableTableRow
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
                      <UnstableTableCell isTruncatable>
                        {name ?? <span className="text-muted">&mdash;</span>}
                      </UnstableTableCell>
                      <UnstableTableCell isTruncatable>{email}</UnstableTableCell>
                      <UnstableTableCell>
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
                                          <ClockIcon />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {isExpired ? "Timed role expired" : "Timed role access"}
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
                                className="flex w-auto flex-wrap gap-1.5"
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
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <UnstableDropdownMenu>
                          <Tooltip>
                            <TooltipTrigger>
                              <UnstableDropdownMenuTrigger asChild>
                                <UnstableIconButton
                                  variant="ghost"
                                  size="xs"
                                  isDisabled={userId === u?.id}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontalIcon />
                                </UnstableIconButton>
                              </UnstableDropdownMenuTrigger>
                            </TooltipTrigger>
                            {userId === u?.id && (
                              <TooltipContent side="left">
                                You cannot modify your own membership
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <UnstableDropdownMenuContent sideOffset={2} align="end">
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Delete}
                              a={ProjectPermissionSub.Member}
                            >
                              {(isAllowed) => (
                                <UnstableDropdownMenuItem
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
                                </UnstableDropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          </UnstableDropdownMenuContent>
                        </UnstableDropdownMenu>
                      </UnstableTableCell>
                    </UnstableTableRow>
                  );
                })}
            </UnstableTableBody>
          </UnstableTable>
          {Boolean(filteredUsers.length) && (
            <UnstablePagination
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
