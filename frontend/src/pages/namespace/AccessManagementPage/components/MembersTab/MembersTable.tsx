import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faClock,
  faEllipsisV,
  faMagnifyingGlass,
  faSearch,
  faUsers,
  faUserXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { NamespacePermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { useNamespace, useUser } from "@app/context";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { namespaceUserMembershipQueryKeys } from "@app/hooks/api/namespaceUserMembership";
import { UsePopUpState } from "@app/hooks/usePopUp";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMember", "upgradePlan"]>,
    data?: object
  ) => void;
};

enum MembersOrderBy {
  Name = "firstName",
  Email = "email"
}

export const MembersTable = ({ handlePopUpOpen }: Props) => {
  const { namespaceName } = useNamespace();
  const { user } = useUser();
  const navigate = useNavigate();
  // const filterRoles = useMemo(() => filter.roles, [filter.roles]);

  const userId = user?.id || "";

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
    initPerPage: getUserTablePreference("namespaceMembersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("namespaceMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending: isMembersLoading } = useQuery(
    namespaceUserMembershipQueryKeys.list({
      namespaceName,
      limit: 10000,
      offset
    })
  );
  const { members = [] } = data || {};

  const filteredUsers = useMemo(
    () =>
      members
        ?.filter(
          ({ user: u }) =>
            u?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.username?.toLowerCase().includes(search.toLowerCase()) ||
            u?.email?.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
          const [memberOne, memberTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          let valueOne: string;
          let valueTwo: string;

          switch (orderBy) {
            case MembersOrderBy.Email:
              valueOne = memberOne.user.email;
              valueTwo = memberTwo.user.email;
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

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search members..."
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
              <Th>Role</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isMembersLoading && <TableSkeleton columns={4} innerKey="namespace-members" />}
            {!isMembersLoading &&
              filteredUsers.slice(offset, perPage * page).map((namespaceMember) => {
                const { user: u, id: membershipId, roles } = namespaceMember;
                const name =
                  u.firstName || u.lastName ? `${u.firstName} ${u.lastName || ""}` : null;
                const email = u?.email;

                return (
                  <Tr
                    key={`membership-${membershipId}`}
                    className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") {
                        navigate({
                          to: "/organization/namespaces/$namespaceName/members/$membershipId",
                          params: {
                            namespaceName,
                            membershipId
                          }
                        });
                      }
                    }}
                    onClick={() =>
                      navigate({
                        to: "/organization/namespaces/$namespaceName/members/$membershipId",
                        params: {
                          namespaceName,
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
                                    <div className="capitalize">{customRoleName || role}</div>
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
                                          <div>{customRoleName || role}</div>
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
                              <NamespacePermissionCan
                                I={NamespacePermissionActions.Delete}
                                a={NamespacePermissionSubjects.Member}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    icon={<FontAwesomeIcon icon={faUserXmark} />}
                                    isDisabled={!isAllowed}
                                    onClick={(evt) => {
                                      evt.preventDefault();
                                      evt.stopPropagation();
                                      handlePopUpOpen("removeMember", { membershipId });
                                    }}
                                  >
                                    Remove User From Namespace
                                  </DropdownMenuItem>
                                )}
                              </NamespacePermissionCan>
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
            title={
              members.length ? "No namespace members match search..." : "No namespace members found"
            }
            icon={members.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
