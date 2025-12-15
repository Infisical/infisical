import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faChevronRight,
  faEdit,
  faEllipsisV,
  faFilter,
  faInfoCircle,
  faMagnifyingGlass,
  faSearch,
  faUsers,
  faUserSlash,
  faUserXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { UserCogIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { LastLoginSection } from "@app/components/organization/LastLoginSection";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { useResendOrgMemberInvitation } from "@app/hooks/api/users/mutation";
import { OrgUser } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["removeMember", "deactivateMember", "upgradePlan", "removeMembers"]
    >,
    data?: {
      orgMembershipId?: string;
      username?: string;
      text?: string;
      selectedOrgMemberships?: OrgUser[];
    }
  ) => void;
  setCompleteInviteLinks: (links: Array<{ email: string; link: string }> | null) => void;
  selectedMemberIds: string[];
  setSelectedMemberIds: Dispatch<SetStateAction<string[]>>;
};

enum OrgMembersOrderBy {
  Name = "firstName",
  Email = "email",
  Role = "role"
}

type Filter = {
  roles: string[];
};

export const OrgMembersTable = ({
  handlePopUpOpen,
  setCompleteInviteLinks,
  selectedMemberIds,
  setSelectedMemberIds
}: Props) => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { user } = useUser();
  const userId = user?.id || "";
  const orgId = currentOrg?.id || "";

  const { data: roles, isPending: isRolesLoading } = useGetOrgRoles(orgId);

  const { data: serverDetails } = useFetchServerStatus();
  const { data: members = [], isPending: isMembersLoading } = useGetOrgUsers(orgId);

  const { mutateAsync: resendOrgMemberInvitation, isPending: isResendInvitePending } =
    useResendOrgMemberInvitation();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();
  const [resendInviteId, setResendInviteId] = useState<string | null>(null);

  const onRoleChange = async (membershipId: string, role: string) => {
    if (!currentOrg?.id) return;

    // TODO: replace hardcoding default role
    const isCustomRole = !["admin", "member", "no-access"].includes(role);

    if (
      isCustomRole &&
      subscription &&
      !subscription?.get(SubscriptionProductCategory.Platform, "rbac")
    ) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to assigning custom roles to members. To unlock this feature, please upgrade to Infisical Pro plan."
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
  };

  const onResendInvite = async (membershipId: string) => {
    setResendInviteId(membershipId);
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
    } finally {
      setResendInviteId(null);
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

  const filteredMembers = useMemo(
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
            case OrgMembersOrderBy.Role:
              valueOne =
                memberOne.role === "custom"
                  ? findRoleFromId(memberOne.roleId)!.slug
                  : memberOne.role;
              valueTwo =
                memberTwo.role === "custom"
                  ? findRoleFromId(memberTwo.roleId)!.slug
                  : memberTwo.role;
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
    totalCount: filteredMembers.length,
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

  const filteredMembersPage = filteredMembers.slice(offset, perPage * page);

  const isPageSelected = filteredMembersPage.length
    ? filteredMembersPage.every((member) => selectedMemberIds.includes(member.id))
    : false;

  // eslint-disable-next-line no-nested-ternary
  const isPageIndeterminate = isPageSelected
    ? false
    : filteredMembersPage.length
      ? filteredMembersPage.some((member) => selectedMemberIds.includes(member.id))
      : false;

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
                  Filter {isSubOrganization ? "Sub-" : ""}Organization Users by Role
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
          placeholder={`Search ${isSubOrganization ? "sub-" : ""}organization users...`}
        />
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-5">
                <Checkbox
                  id="member-page-select"
                  isChecked={isPageSelected || isPageIndeterminate}
                  isIndeterminate={isPageIndeterminate}
                  onCheckedChange={() => {
                    if (isPageSelected) {
                      setSelectedMemberIds((prev) =>
                        prev.filter(
                          (memberId) => !filteredMembersPage.find((m) => m.id === memberId)
                        )
                      );
                    } else {
                      setSelectedMemberIds((prev) => [
                        ...new Set([...prev, ...filteredMembersPage.map((member) => member.id)])
                      ]);
                    }
                  }}
                />
              </Th>
              <Th className="min-w-40 md:w-1/3 md:min-w-0">
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
              <Th className="w-1/3">
                <div className="flex items-center">
                  {isSubOrganization ? "Sub-" : ""}Organization Role
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === OrgMembersOrderBy.Role ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrgMembersOrderBy.Role)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Role
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={5} innerKey="org-members" />}
            {!isLoading &&
              filteredMembersPage.map(
                ({
                  user: u,
                  inviteEmail,
                  role,
                  roleId,
                  id: orgMembershipId,
                  status,
                  isActive,
                  lastLoginAuthMethod,
                  lastLoginTime
                }) => {
                  const name =
                    u && u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : null;
                  const email = u?.email || inviteEmail;
                  const username = u?.username ?? inviteEmail ?? "-";
                  const isSelected = selectedMemberIds.includes(orgMembershipId);
                  return (
                    <Tr
                      key={`org-membership-${orgMembershipId}`}
                      className="h-10 w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/members/$membershipId" as const,
                          params: {
                            membershipId: orgMembershipId,
                            orgId
                          }
                        })
                      }
                    >
                      <Td>
                        <Checkbox
                          id={`select-member-${orgMembershipId}`}
                          isChecked={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMemberIds((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== orgMembershipId)
                                : [...prev, orgMembershipId]
                            );
                          }}
                        />
                      </Td>
                      <Td
                        className={twMerge("group max-w-0", isActive ? "" : "text-mineshaft-400")}
                      >
                        <div className="flex w-full items-center gap-x-2">
                          <p className="truncate">
                            {name ?? <span className="text-mineshaft-400">Not Set</span>}
                          </p>
                          {u.superAdmin && (
                            <Tooltip content="Server Admin">
                              <Badge variant="info">
                                <UserCogIcon />
                                <span className="hidden xl:inline">Server Admin</span>
                              </Badge>
                            </Tooltip>
                          )}
                          {lastLoginAuthMethod && lastLoginTime && (
                            <Tooltip
                              className="max-w-96 min-w-52 px-3"
                              content={
                                <LastLoginSection
                                  lastLoginAuthMethod={lastLoginAuthMethod}
                                  lastLoginTime={lastLoginTime}
                                />
                              }
                            >
                              <FontAwesomeIcon
                                icon={faInfoCircle}
                                className="ml-2 text-mineshaft-400 opacity-0 transition-all group-hover:opacity-100"
                              />
                            </Tooltip>
                          )}
                        </div>
                      </Td>
                      <Td className={twMerge("max-w-0", isActive ? "" : "text-mineshaft-400")}>
                        <p className="truncate">{username}</p>
                      </Td>
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Member}
                        >
                          {(isAllowed) => (
                            <Select
                              value={role === "custom" ? findRoleFromId(roleId)?.slug : role}
                              isDisabled={userId === u?.id || !isAllowed}
                              className="h-8 w-48 bg-mineshaft-700"
                              position="popper"
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
                        </OrgPermissionCan>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-6">
                          {isActive &&
                            (status === "invited" || status === "verified") &&
                            email &&
                            !isSubOrganization &&
                            serverDetails?.emailConfigured && (
                              <OrgPermissionCan
                                I={OrgPermissionActions.Edit}
                                a={OrgPermissionSubjects.Member}
                              >
                                {(isAllowed) => (
                                  <Button
                                    isDisabled={!isAllowed || isResendInvitePending}
                                    className="h-8 border-mineshaft-600 bg-mineshaft-700 font-normal"
                                    colorSchema="primary"
                                    variant="outline_bg"
                                    isLoading={
                                      isResendInvitePending && resendInviteId === orgMembershipId
                                    }
                                    onClick={(e) => {
                                      onResendInvite(orgMembershipId);
                                      e.stopPropagation();
                                    }}
                                  >
                                    Resend Invite
                                  </Button>
                                )}
                              </OrgPermissionCan>
                            )}
                          <DropdownMenu>
                            <DropdownMenuTrigger disabled={userId === u?.id} asChild>
                              <IconButton
                                ariaLabel="Options"
                                colorSchema="secondary"
                                className={twMerge("w-6", userId === u?.id && "opacity-50")}
                                variant="plain"
                                isDisabled={userId === u?.id}
                              >
                                <FontAwesomeIcon icon={faEllipsisV} />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              <OrgPermissionCan
                                I={OrgPermissionActions.Edit}
                                a={OrgPermissionSubjects.Member}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate({
                                        to: "/organizations/$orgId/members/$membershipId" as const,
                                        params: {
                                          membershipId: orgMembershipId,
                                          orgId
                                        }
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faEdit} />}
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
                                    icon={<FontAwesomeIcon icon={faUserSlash} />}
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
                                    isDisabled={!isAllowed}
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
                                    isDisabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faUserXmark} />}
                                  >
                                    Remove User
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </Td>
                    </Tr>
                  );
                }
              )}
          </TBody>
        </Table>
        {Boolean(filteredMembers.length) && (
          <Pagination
            count={filteredMembers.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isMembersLoading && !filteredMembers?.length && (
          <EmptyState
            title={
              members.length
                ? `No ${isSubOrganization ? "sub-" : ""}organization users match search...`
                : `No ${isSubOrganization ? "sub-" : ""}organization users found`
            }
            icon={members.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
