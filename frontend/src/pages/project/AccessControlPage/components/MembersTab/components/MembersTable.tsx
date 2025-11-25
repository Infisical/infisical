import { useCallback, useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faChevronRight,
  faClock,
  faEllipsisV,
  faFilter,
  faMagnifyingGlass,
  faSearch,
  faUsers,
  faUserXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  EmptyState,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
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

  return (
    <div>
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Users"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-9.5 w-[2.6rem] items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownSubMenu>
              <DropdownSubMenuTrigger
                iconPos="right"
                icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
              >
                Roles
              </DropdownSubMenuTrigger>
              <DropdownSubMenuContent className="max-h-80 thin-scrollbar overflow-y-auto rounded-l-none">
                <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                  Filter Project Users by Role
                </DropdownMenuLabel>
                {projectRoles?.map(({ id, slug, name }) => (
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      handleRoleToggle(slug);
                    }}
                    key={id}
                    icon={filter.roles.includes(slug) && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    <div className="flex items-center">
                      <div
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ background: "#bec2c8" }}
                      />
                      {name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownSubMenuContent>
            </DropdownSubMenu>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search project users..."
        />
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === MembersOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(MembersOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === MembersOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Email
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === MembersOrderBy.Email ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(MembersOrderBy.Email)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC && orderBy === MembersOrderBy.Email
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>Project Role</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isMembersLoading && <TableSkeleton columns={4} innerKey="project-members" />}
            {!isMembersLoading &&
              filteredUsers.slice(offset, perPage * page).map((projectMember) => {
                const { user: u, inviteEmail, id: membershipId, roles } = projectMember;
                const name =
                  u.firstName || u.lastName ? `${u.firstName} ${u.lastName || ""}` : null;
                const email = u?.email || inviteEmail;

                return (
                  <Tr
                    key={`membership-${membershipId}`}
                    className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
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
                    <Td>{name ?? <span className="text-mineshaft-400">Not Set</span>}</Td>
                    <Td>{email}</Td>
                    <Td>
                      <div className="flex items-center space-x-2">
                        {roles
                          .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                          .map(
                            ({ role, customRoleName, id, isTemporary, temporaryAccessEndTime }) => {
                              const isExpired =
                                new Date() > new Date(temporaryAccessEndTime || ("" as string));
                              return (
                                <Tag key={id}>
                                  <div className="flex items-center space-x-2">
                                    <div className="capitalize">
                                      {formatProjectRoleName(role, customRoleName)}
                                    </div>
                                    {isTemporary && (
                                      <div>
                                        <Tooltip
                                          content={
                                            isExpired ? "Timed role expired" : "Timed role access"
                                          }
                                        >
                                          <FontAwesomeIcon
                                            icon={faClock}
                                            className={twMerge(isExpired && "text-red-600")}
                                          />
                                        </Tooltip>
                                      </div>
                                    )}
                                  </div>
                                </Tag>
                              );
                            }
                          )}
                        {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                          <HoverCard>
                            <HoverCardTrigger>
                              <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
                            </HoverCardTrigger>
                            <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
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
                                      <Tag key={id} className="capitalize">
                                        <div className="flex items-center space-x-2">
                                          <div>{formatProjectRoleName(role, customRoleName)}</div>
                                          {isTemporary && (
                                            <div>
                                              <Tooltip
                                                content={
                                                  isExpired ? "Access expired" : "Temporary access"
                                                }
                                              >
                                                <FontAwesomeIcon
                                                  icon={faClock}
                                                  className={twMerge(
                                                    new Date() >
                                                      new Date(temporaryAccessEndTime as string) &&
                                                      "text-red-600"
                                                  )}
                                                />
                                              </Tooltip>
                                            </div>
                                          )}
                                        </div>
                                      </Tag>
                                    );
                                  }
                                )}
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {userId !== u?.id && (
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
                            <DropdownMenuContent sideOffset={2} align="end">
                              <ProjectPermissionCan
                                I={ProjectPermissionActions.Delete}
                                a={ProjectPermissionSub.Member}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    icon={<FontAwesomeIcon icon={faUserXmark} />}
                                    isDisabled={!isAllowed}
                                    onClick={(evt) => {
                                      evt.preventDefault();
                                      evt.stopPropagation();
                                      handlePopUpOpen("removeMember", { username: u.username });
                                    }}
                                  >
                                    Remove User From Project
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Tooltip>
                      )}
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
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
        {!isMembersLoading && !filteredUsers?.length && (
          <EmptyState
            title={members.length ? "No project users match search..." : "No project users found"}
            icon={members.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
