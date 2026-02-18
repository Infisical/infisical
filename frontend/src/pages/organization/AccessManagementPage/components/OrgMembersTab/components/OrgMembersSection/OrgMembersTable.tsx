import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  FilterIcon,
  InfoIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  UserCogIcon,
  UserMinusIcon,
  UserXIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { LastLoginSection } from "@app/components/organization/LastLoginSection";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Checkbox,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

    if (isCustomRole && subscription && !subscription?.rbac) {
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
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${isSubOrganization ? "sub-" : ""}organization users...`}
          />
        </InputGroup>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                isTableFiltered ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuLabel>
              Filter Users by {isSubOrganization ? "Sub-" : ""}Organization Role
            </UnstableDropdownMenuLabel>
            {roles?.map(({ id, slug, name }) => (
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
      {!isLoading && !filteredMembers?.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {members.length
                ? `No ${isSubOrganization ? "sub-" : ""}organization users match search...`
                : `No ${isSubOrganization ? "sub-" : ""}organization users found`}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {members.length
                ? "Adjust your search or filter criteria."
                : "Invite users to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead className="w-5">
                  <Checkbox
                    id="member-page-select"
                    isChecked={isPageSelected || isPageIndeterminate}
                    isIndeterminate={isPageIndeterminate}
                    variant={isSubOrganization ? "sub-org" : "org"}
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
                </UnstableTableHead>
                <UnstableTableHead
                  onClick={() => handleSort(OrgMembersOrderBy.Name)}
                  className="min-w-40 lg:w-1/3 lg:min-w-0"
                >
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Name &&
                        "rotate-180",
                      orderBy !== OrgMembersOrderBy.Name && "opacity-30",
                      "transition-transform"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead
                  onClick={() => handleSort(OrgMembersOrderBy.Email)}
                  className="w-1/3"
                >
                  Username
                  <ChevronDownIcon
                    className={twMerge(
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Email &&
                        "rotate-180",
                      orderBy !== OrgMembersOrderBy.Email && "opacity-30",
                      "transition-transform"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead onClick={() => handleSort(OrgMembersOrderBy.Role)}>
                  {isSubOrganization ? "Sub-" : ""}Organization Role
                  <ChevronDownIcon
                    className={twMerge(
                      orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgMembersOrderBy.Role &&
                        "rotate-180",
                      orderBy !== OrgMembersOrderBy.Role && "opacity-30",
                      "transition-transform"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isLoading &&
                Array.from({ length: perPage }).map((_, i) => (
                  <UnstableTableRow key={`skeleton-${i + 1}`}>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-4" />
                    </UnstableTableCell>
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
                      <UnstableTableRow
                        key={`org-membership-${orgMembershipId}`}
                        className="group cursor-pointer"
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
                        <UnstableTableCell>
                          <Checkbox
                            id={`select-member-${orgMembershipId}`}
                            isChecked={isSelected}
                            variant={isSubOrganization ? "sub-org" : "org"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMemberIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== orgMembershipId)
                                  : [...prev, orgMembershipId]
                              );
                            }}
                          />
                        </UnstableTableCell>
                        <UnstableTableCell
                          isTruncatable
                          className={twMerge(!isActive && "text-muted")}
                        >
                          <div className="flex w-full items-center gap-x-1.5">
                            <p className="truncate">
                              {name ?? <span className="text-muted">—</span>}
                            </p>
                            {u.superAdmin && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="info">
                                    <UserCogIcon />
                                    <span className="hidden 2xl:inline">Server Admin</span>
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>Server Admin</TooltipContent>
                              </Tooltip>
                            )}
                            {lastLoginAuthMethod && lastLoginTime && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <InfoIcon className="size-3.5 text-muted opacity-0 transition-all group-hover:opacity-100" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-96 min-w-52 px-3">
                                  <LastLoginSection
                                    lastLoginAuthMethod={lastLoginAuthMethod}
                                    lastLoginTime={lastLoginTime}
                                  />
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </UnstableTableCell>
                        <UnstableTableCell
                          isTruncatable
                          className={twMerge(!isActive && "text-muted")}
                        >
                          <p className="truncate">{username}</p>
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Member}
                          >
                            {(isAllowed) => (
                              <Select
                                value={role === "custom" ? findRoleFromId(roleId)?.slug : role}
                                onValueChange={(selectedRole) =>
                                  onRoleChange(orgMembershipId, selectedRole)
                                }
                                disabled={userId === u?.id || !isAllowed}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="!w-full max-w-32 lg:max-w-64"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-w-32 lg:max-w-60">
                                  {(roles || [])
                                    .filter(({ slug }) =>
                                      slug === "owner" ? isIamOwner || role === "owner" : true
                                    )
                                    .map(({ slug, name: roleName }) => (
                                      <SelectItem value={slug} key={`owner-option-${slug}`}>
                                        {roleName}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            )}
                          </OrgPermissionCan>
                        </UnstableTableCell>
                        <UnstableTableCell>
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
                                      variant={isSubOrganization ? "sub-org" : "org"}
                                      size="xs"
                                      isPending={
                                        isResendInvitePending && resendInviteId === orgMembershipId
                                      }
                                      onClick={(e) => {
                                        onResendInvite(orgMembershipId);
                                        e.stopPropagation();
                                      }}
                                    >
                                      <MailIcon />
                                      Resend Invite
                                    </Button>
                                  )}
                                </OrgPermissionCan>
                              )}
                            <UnstableDropdownMenu>
                              <UnstableDropdownMenuTrigger
                                disabled={userId === u?.id}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <UnstableIconButton
                                  variant="ghost"
                                  size="xs"
                                  isDisabled={userId === u?.id}
                                >
                                  <MoreHorizontalIcon />
                                </UnstableIconButton>
                              </UnstableDropdownMenuTrigger>
                              <UnstableDropdownMenuContent sideOffset={2} align="end">
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
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
                                    >
                                      <PencilIcon />
                                      Edit User
                                    </UnstableDropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Delete}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
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
                                      <UserMinusIcon />
                                      {`${isActive ? "Deactivate" : "Activate"} User`}
                                    </UnstableDropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Delete}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
                                      variant="danger"
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
                                    >
                                      <UserXIcon />
                                      Remove User
                                    </UnstableDropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              </UnstableDropdownMenuContent>
                            </UnstableDropdownMenu>
                          </div>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  }
                )}
            </UnstableTableBody>
          </UnstableTable>
          {Boolean(filteredMembers.length) && (
            <UnstablePagination
              count={filteredMembers.length}
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
