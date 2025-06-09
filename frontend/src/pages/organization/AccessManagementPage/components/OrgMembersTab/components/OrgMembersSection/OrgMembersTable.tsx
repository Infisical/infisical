import { useCallback, useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faChevronRight,
  faEllipsis,
  faFilter,
  faMagnifyingGlass,
  faSearch,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  useFetchServerStatus,
  useGetOrgRoles,
  useGetOrgUsers,
  useUpdateOrgMembership
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useResendOrgMemberInvitation } from "@app/hooks/api/users/mutation";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMember", "deactivateMember", "upgradePlan"]>,
    data?: {
      orgMembershipId?: string;
      username?: string;
      description?: string;
    }
  ) => void;
  setCompleteInviteLinks: (links: Array<{ email: string; link: string }> | null) => void;
};

enum OrgMembersOrderBy {
  Name = "firstName",
  Email = "email"
}

type Filter = {
  roles: string[];
};

export const OrgMembersTable = ({ handlePopUpOpen, setCompleteInviteLinks }: Props) => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(orgId);

  const { data: serverDetails } = useFetchServerStatus();
  const { data: members = [], isPending: isMembersLoading } = useGetOrgUsers(orgId);

  const { mutateAsync: resendOrgMemberInvitation } = useResendOrgMemberInvitation();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();

  const onRoleChange = async (membershipId: string, role: string) => {
    if (!currentOrg?.id) return;

    try {
      // TODO: replace hardcoding default role
      const isCustomRole = !["admin", "member", "no-access"].includes(role);

      if (isCustomRole && subscription && !subscription?.rbac) {
        handlePopUpOpen("upgradePlan", {
          description: "You can assign custom roles to members if you upgrade your Infisical plan."
        });
        return;
      }

      await updateOrgMembership({
        organizationId: currentOrg?.id,
        membershipId,
        role
      });

      createNotification({
        text: "Successfully updated user role",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to update user role",
        type: "error"
      });
    }
  };

  const onResendInvite = async (membershipId: string) => {
    try {
      const signupToken = await resendOrgMemberInvitation({
        membershipId
      });

      if (signupToken) {
        setCompleteInviteLinks([signupToken]);
        return;
      }

      createNotification({
        text: "Successfully resent org invitation",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to resend org invitation",
        type: "error"
      });
    }
  };

  const isLoading = isMembersLoading || isRolesLoading;

  const isIamOwner = useMemo(
    () => members?.find(({ user: u }) => userId === u?.id)?.role === "owner",
    [userId, members]
  );

  const findRoleFromId = useCallback(
    (roleId: string) => {
      return (roles || []).find(({ id }) => id === roleId);
    },
    [roles]
  );

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
  } = usePagination<OrgMembersOrderBy>(OrgMembersOrderBy.Name, {
    initPerPage: getUserTablePreference("orgMembersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("orgMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const [filter, setFilter] = useState<Filter>({
    roles: []
  });

  const filteredUsers = useMemo(
    () =>
      members
        ?.filter(({ user: u, inviteEmail, role, roleId }) => {
          if (
            filter.roles.length &&
            !filter.roles.includes(role === "custom" ? findRoleFromId(roleId)!.slug : role)
          ) {
            return false;
          }

          return (
            u?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
            u?.username?.toLowerCase().includes(search.toLowerCase()) ||
            u?.email?.toLowerCase().includes(search.toLowerCase()) ||
            inviteEmail?.toLowerCase().includes(search.toLowerCase())
          );
        })
        .sort((a, b) => {
          const [memberOne, memberTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          let valueOne: string;
          let valueTwo: string;

          switch (orderBy) {
            case OrgMembersOrderBy.Email:
              valueOne = memberOne.user.email || memberOne.inviteEmail;
              valueTwo = memberTwo.user.email || memberTwo.inviteEmail;
              break;
            case OrgMembersOrderBy.Name:
            default:
              valueOne = memberOne.user.firstName;
              valueTwo = memberTwo.user.firstName;
          }

          if (!valueOne) return 1;
          if (!valueTwo) return -1;

          return valueOne.toLowerCase().localeCompare(valueTwo.toLowerCase());
        }),
    [members, search, orderDirection, orderBy, filter]
  );

  const handleSort = (column: OrgMembersOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  useResetPageHelper({
    totalCount: filteredUsers.length,
    offset,
    setPage
  });

  const handleRoleToggle = useCallback(
    (roleSlug: string) =>
      setFilter((state) => {
        const currentRoles = state.roles || [];

        if (currentRoles.includes(roleSlug)) {
          return { ...state, roles: currentRoles.filter((role) => role !== roleSlug) };
        }
        return { ...state, roles: [...currentRoles, roleSlug] };
      }),
    []
  );

  const isTableFiltered = Boolean(filter.roles.length);

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
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
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
              <DropdownSubMenuContent className="thin-scrollbar max-h-[20rem] overflow-y-auto rounded-l-none">
                <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                  Apply Roles to Filter Users
                </DropdownMenuLabel>
                {roles?.map(({ id, slug, name }) => (
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
                    className={`ml-2 ${orderBy === OrgMembersOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrgMembersOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Username
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === OrgMembersOrderBy.Email ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrgMembersOrderBy.Email)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Email
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
            {isLoading && <TableSkeleton columns={5} innerKey="org-members" />}
            {!isLoading &&
              filteredUsers
                .slice(offset, perPage * page)
                .map(
                  ({
                    user: u,
                    inviteEmail,
                    role,
                    roleId,
                    id: orgMembershipId,
                    status,
                    isActive
                  }) => {
                    const name =
                      u && u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : "-";
                    const email = u?.email || inviteEmail;
                    const username = u?.username ?? inviteEmail ?? "-";
                    return (
                      <Tr
                        key={`org-membership-${orgMembershipId}`}
                        className="h-10 w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                        onClick={() =>
                          navigate({
                            to: "/organization/members/$membershipId" as const,
                            params: {
                              membershipId: orgMembershipId
                            }
                          })
                        }
                      >
                        <Td className={isActive ? "" : "text-mineshaft-400"}>
                          {name}
                          {u.superAdmin && (
                            <Badge variant="primary" className="ml-2">
                              Server Admin
                            </Badge>
                          )}
                        </Td>
                        <Td className={isActive ? "" : "text-mineshaft-400"}>{username}</Td>
                        <Td>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Member}
                          >
                            {(isAllowed) => (
                              <>
                                {!isActive && (
                                  <Button
                                    isDisabled
                                    className="w-40"
                                    colorSchema="primary"
                                    variant="outline_bg"
                                    onClick={() => {}}
                                  >
                                    Suspended
                                  </Button>
                                )}
                                {isActive && status === "accepted" && (
                                  <Select
                                    value={role === "custom" ? findRoleFromId(roleId)?.slug : role}
                                    isDisabled={userId === u?.id || !isAllowed}
                                    className="w-48 bg-mineshaft-600"
                                    dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                    onValueChange={(selectedRole) =>
                                      onRoleChange(orgMembershipId, selectedRole)
                                    }
                                  >
                                    {(roles || [])
                                      .filter(({ slug }) =>
                                        slug === "owner" ? isIamOwner || role === "owner" : true
                                      )
                                      .map(({ slug, name: roleName }) => (
                                        <SelectItem value={slug} key={`owner-option-${slug}`}>
                                          {roleName}
                                        </SelectItem>
                                      ))}
                                  </Select>
                                )}
                                {isActive &&
                                  (status === "invited" || status === "verified") &&
                                  email &&
                                  serverDetails?.emailConfigured && (
                                    <Button
                                      isDisabled={!isAllowed}
                                      className="w-48"
                                      colorSchema="primary"
                                      variant="outline_bg"
                                      onClick={(e) => {
                                        onResendInvite(orgMembershipId);
                                        e.stopPropagation();
                                      }}
                                    >
                                      Resend invite
                                    </Button>
                                  )}
                              </>
                            )}
                          </OrgPermissionCan>
                        </Td>
                        <Td>
                          {userId !== u?.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="rounded-lg">
                                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                  <FontAwesomeIcon size="sm" icon={faEllipsis} />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="p-1">
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        !isAllowed &&
                                          "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate({
                                          to: "/organization/members/$membershipId" as const,
                                          params: {
                                            membershipId: orgMembershipId
                                          }
                                        });
                                      }}
                                      disabled={!isAllowed}
                                    >
                                      Edit User
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Delete}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={
                                        isActive
                                          ? twMerge(
                                              isAllowed
                                                ? "hover:!bg-red-500 hover:!text-white"
                                                : "pointer-events-none cursor-not-allowed opacity-50"
                                            )
                                          : ""
                                      }
                                      onClick={async (e) => {
                                        e.stopPropagation();

                                        if (currentOrg?.scimEnabled) {
                                          createNotification({
                                            text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
                                            type: "error"
                                          });
                                          return;
                                        }

                                        if (!isActive) {
                                          // activate user
                                          await updateOrgMembership({
                                            organizationId: orgId,
                                            membershipId: orgMembershipId,
                                            isActive: true
                                          });

                                          return;
                                        }

                                        // deactivate user
                                        handlePopUpOpen("deactivateMember", {
                                          orgMembershipId,
                                          username
                                        });
                                      }}
                                      disabled={!isAllowed}
                                    >
                                      {`${isActive ? "Deactivate" : "Activate"} User`}
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Delete}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      className={twMerge(
                                        isAllowed
                                          ? "hover:!bg-red-500 hover:!text-white"
                                          : "pointer-events-none cursor-not-allowed opacity-50"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        if (currentOrg?.scimEnabled && isActive) {
                                          createNotification({
                                            text: "You cannot manage users from Infisical when org-level auth is enforced for your organization",
                                            type: "error"
                                          });
                                          return;
                                        }

                                        handlePopUpOpen("removeMember", {
                                          orgMembershipId,
                                          username
                                        });
                                      }}
                                      disabled={!isAllowed}
                                    >
                                      Remove User
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </Td>
                      </Tr>
                    );
                  }
                )}
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
              members.length
                ? "No organization members match search..."
                : "No organization members found"
            }
            icon={members.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
