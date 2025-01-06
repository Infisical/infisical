import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faClock,
  faEllipsisV,
  faMagnifyingGlass,
  faSearch,
  faTrash,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useUser,
  useWorkspace
} from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;
const formatRoleName = (role: string, customRoleName?: string) => {
  if (role === ProjectMembershipRole.Custom) return customRoleName;
  if (role === ProjectMembershipRole.Member) return "Developer";
  if (role === ProjectMembershipRole.NoAccess) return "No access";
  return role;
};

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
  const { currentWorkspace } = useWorkspace();
  const { user } = useUser();
  const navigate = useNavigate();

  const userId = user?.id || "";
  const workspaceId = currentWorkspace?.id || "";

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
  } = usePagination<MembersOrderBy>(MembersOrderBy.Name, { initPerPage: 20 });

  const { data: members = [], isPending: isMembersLoading } = useGetWorkspaceUsers(workspaceId);

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

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
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
            {isMembersLoading && <TableSkeleton columns={4} innerKey="project-members" />}
            {!isMembersLoading &&
              filteredUsers.slice(offset, perPage * page).map((projectMember) => {
                const { user: u, inviteEmail, id: membershipId, roles } = projectMember;
                const name = u.firstName || u.lastName ? `${u.firstName} ${u.lastName || ""}` : "-";
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
                          to: `/${currentWorkspace.type}/$projectId/members/$membershipId` as const,
                          params: {
                            projectId: workspaceId,
                            membershipId
                          }
                        });
                      }
                    }}
                    onClick={() =>
                      navigate({
                        to: `/${currentWorkspace.type}/$projectId/members/$membershipId` as const,
                        params: {
                          projectId: workspaceId,
                          membershipId
                        }
                      })
                    }
                  >
                    <Td>{name}</Td>
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
                                      {formatRoleName(role, customRoleName)}
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
                                          <div>{formatRoleName(role, customRoleName)}</div>
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
                        <div className="flex items-center space-x-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Member}
                          >
                            {(isAllowed) => (
                              <IconButton
                                colorSchema="danger"
                                variant="plain"
                                ariaLabel="update"
                                className="ml-4"
                                isDisabled={userId === u?.id || !isAllowed}
                                onClick={(evt) => {
                                  evt.preventDefault();
                                  evt.stopPropagation();
                                  handlePopUpOpen("removeMember", { username: u.username });
                                }}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            )}
                          </ProjectPermissionCan>
                          <IconButton ariaLabel="more-icon" variant="plain">
                            <FontAwesomeIcon icon={faEllipsisV} />
                          </IconButton>
                        </div>
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
            onChangePerPage={setPerPage}
          />
        )}
        {!isMembersLoading && !filteredUsers?.length && (
          <EmptyState
            title={
              members.length ? "No project members match search..." : "No project members found"
            }
            icon={members.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
