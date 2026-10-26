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
  UserPlusIcon,
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
  RowLink,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription,
  useUser
} from "@app/context";
import { findOrgMembershipRole, isCustomOrgRole } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  useAddUsersToOrg,
  useFetchServerStatus,
  useGetOrgRoles,
  useGetOrgUserAccess,
  useUpdateOrgMembership
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useResendOrgMemberInvitation } from "@app/hooks/api/users/mutation";
import { TOrgUserAccess } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupAccessPopover } from "./GroupAccessPopover";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["addMember", "removeMember", "deactivateMember", "upgradePlan", "removeMembers"]
    >,
    data?: {
      orgMembershipId?: string;
      username?: string;
      text?: string;
      selectedOrgMemberships?: TOrgUserAccess[];
      isEnterpriseFeature?: boolean;
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

const GROUP_ONLY_SELECTION_TOOLTIP = "Access is managed through groups";

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
  const { data: members = [], isPending: isMembersLoading } = useGetOrgUserAccess(orgId);

  const { mutateAsync: resendOrgMemberInvitation, isPending: isResendInvitePending } =
    useResendOrgMemberInvitation();
  const { mutateAsync: updateOrgMembership } = useUpdateOrgMembership();
  const { mutateAsync: addUsersToOrg, isPending: isInviteDirectMemberPending } = useAddUsersToOrg();
  const [resendInviteId, setResendInviteId] = useState<string | null>(null);
  const [openGroupPopoverUserId, setOpenGroupPopoverUserId] = useState<string | null>(null);

  const onRoleChange = async (membershipId: string, role: string) => {
    if (!currentOrg?.id) return;

    const isCustomRole = isCustomOrgRole(role);

    if (isCustomRole && subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan", {
        text: "Your current plan does not include access to assigning custom roles to members. To unlock this feature, please upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
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
        handlePopUpOpen("addMember");
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

  const onInviteAsDirectMember = async (username: string) => {
    if (!currentOrg?.id) return;

    const defaultRole = findOrgMembershipRole(roles ?? [], currentOrg.defaultMembershipRole);

    const { data } = await addUsersToOrg({
      organizationId: currentOrg.id,
      inviteeEmails: [username],
      organizationRoleSlug: defaultRole?.slug ?? "member"
    });

    if (data.completeInviteLinks?.length) {
      setCompleteInviteLinks(data.completeInviteLinks);
      handlePopUpOpen("addMember");
      return;
    }

    createNotification({
      text: "Successfully invited user to the organization.",
      type: "success"
    });
  };

  const isLoading = isMembersLoading || isRolesLoading;

  const isIamOwner = useMemo(
    () => members?.find(({ user: u }) => userId === u?.id)?.membership?.role === "owner",
    [userId, members]
  );

  const findRoleFromId = useCallback(
    (roleId: string) => {
      return (roles || []).find(({ id }) => id === roleId);
    },
    [roles]
  );

  const findRole = useCallback(
    ({ role, roleId }: { role: string; roleId?: string | null }) =>
      role === "custom" ? findRoleFromId(roleId ?? "") : (roles || []).find((r) => r.slug === role),
    [roles, findRoleFromId]
  );

  const getRoleSlug = useCallback(
    (roleRef: { role: string; roleId?: string | null }) =>
      roleRef.role === "custom" ? findRole(roleRef)?.slug : roleRef.role,
    [findRole]
  );

  const getRoleName = useCallback(
    (roleRef: { role: string; roleId?: string | null }) => findRole(roleRef)?.name ?? roleRef.role,
    [findRole]
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
        ?.filter(({ user: u, membership, groups }) => {
          if (filter.roles.length) {
            const roleRefs = [
              ...(membership ? [membership] : []),
              ...groups.flatMap((g) => g.roles)
            ];
            if (!roleRefs.some((roleRef) => filter.roles.includes(getRoleSlug(roleRef) ?? ""))) {
              return false;
            }
          }

          const inviteEmail = membership?.inviteEmail;
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

          let valueOne: string | undefined | null;
          let valueTwo: string | undefined | null;

          switch (orderBy) {
            case OrgMembersOrderBy.Email:
              valueOne = memberOne.user.email || memberOne.membership?.inviteEmail;
              valueTwo = memberTwo.user.email || memberTwo.membership?.inviteEmail;
              break;
            case OrgMembersOrderBy.Role:
              valueOne = memberOne.membership ? getRoleSlug(memberOne.membership) : undefined;
              valueTwo = memberTwo.membership ? getRoleSlug(memberTwo.membership) : undefined;
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
    [members, search, orderDirection, orderBy, filter, getRoleSlug]
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

  // Bulk actions only work on direct memberships, so group-only rows can't be selected.
  const selectableMembershipIds = filteredMembersPage.flatMap(({ membership }) =>
    membership ? [membership.id] : []
  );

  const isPageSelected = selectableMembershipIds.length
    ? selectableMembershipIds.every((membershipId) => selectedMemberIds.includes(membershipId))
    : false;

  // eslint-disable-next-line no-nested-ternary
  const isPageIndeterminate = isPageSelected
    ? false
    : selectableMembershipIds.length
      ? selectableMembershipIds.some((membershipId) => selectedMemberIds.includes(membershipId))
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                isTableFiltered ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              Filter by {isSubOrganization ? "Sub-" : ""}Organization Role
            </DropdownMenuLabel>
            {roles?.map(({ id, slug, name }) => (
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
      {!isLoading && !filteredMembers?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {members.length
                ? `No ${isSubOrganization ? "sub-" : ""}organization users match search`
                : `No ${isSubOrganization ? "sub-" : ""}organization users found`}
            </EmptyTitle>
            <EmptyDescription>
              {members.length
                ? "Adjust your search or filter criteria."
                : "Invite users to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-5">
                  <Checkbox
                    id="member-page-select"
                    isChecked={isPageSelected || isPageIndeterminate}
                    isIndeterminate={isPageIndeterminate}
                    isDisabled={!selectableMembershipIds.length}
                    variant={isSubOrganization ? "sub-org" : "org"}
                    onCheckedChange={() => {
                      if (isPageSelected) {
                        setSelectedMemberIds((prev) =>
                          prev.filter((memberId) => !selectableMembershipIds.includes(memberId))
                        );
                      } else {
                        setSelectedMemberIds((prev) => [
                          ...new Set([...prev, ...selectableMembershipIds])
                        ]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead
                  onClick={() => handleSort(OrgMembersOrderBy.Name)}
                  className="min-w-40 lg:w-1/4 lg:min-w-0"
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
                </TableHead>
                <TableHead onClick={() => handleSort(OrgMembersOrderBy.Email)} className="w-1/3">
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
                </TableHead>
                <TableHead className="w-24">Groups</TableHead>
                <TableHead onClick={() => handleSort(OrgMembersOrderBy.Role)}>
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
                </TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: perPage }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell variant="action">
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                filteredMembersPage.map(({ user: u, membership, groups }) => {
                  const name =
                    u && u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : null;
                  const email = u?.email || membership?.inviteEmail;
                  const username = u?.username ?? membership?.inviteEmail ?? "-";
                  const isSelf = userId === u?.id;
                  const isActive = membership?.isActive ?? true;
                  const isSelected = Boolean(
                    membership && selectedMemberIds.includes(membership.id)
                  );

                  return (
                    <TableRow
                      key={membership ? `org-membership-${membership.id}` : `org-user-${u.id}`}
                      linked={Boolean(membership)}
                      className="group"
                    >
                      <TableCell data-row-interactive>
                        {membership ? (
                          <Checkbox
                            id={`select-member-${membership.id}`}
                            isChecked={isSelected}
                            variant={isSubOrganization ? "sub-org" : "org"}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMemberIds((prev) =>
                                isSelected
                                  ? prev.filter((id) => id !== membership.id)
                                  : [...prev, membership.id]
                              );
                            }}
                          />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <Checkbox
                                  id={`select-member-${u.id}`}
                                  isChecked={false}
                                  isDisabled
                                  aria-label={GROUP_ONLY_SELECTION_TOOLTIP}
                                  variant={isSubOrganization ? "sub-org" : "org"}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{GROUP_ONLY_SELECTION_TOOLTIP}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell isTruncatable className={twMerge(!isActive && "text-muted")}>
                        <div className="flex w-full items-center gap-x-1.5">
                          <p className="truncate">
                            {name ?? <span className="text-muted">—</span>}
                          </p>
                          {u.superAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild data-row-interactive>
                                <Badge variant="info">
                                  <UserCogIcon />
                                  <span className="hidden 2xl:inline">Server Admin</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Server Admin</TooltipContent>
                            </Tooltip>
                          )}
                          {membership?.lastLoginAuthMethod && membership.lastLoginTime && (
                            <Tooltip>
                              <TooltipTrigger>
                                <InfoIcon className="size-3.5 text-muted opacity-0 transition-all group-hover:opacity-100" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-96 min-w-52 px-3">
                                <LastLoginSection
                                  lastLoginAuthMethod={membership.lastLoginAuthMethod}
                                  lastLoginTime={membership.lastLoginTime}
                                />
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell isTruncatable className={twMerge(!isActive && "text-muted")}>
                        {membership ? (
                          <RowLink
                            to="/organizations/$orgId/members/$membershipId"
                            params={{ membershipId: membership.id, orgId }}
                          >
                            {username}
                          </RowLink>
                        ) : (
                          <p className="truncate">{username}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {groups.length ? (
                          <GroupAccessPopover
                            orgId={orgId}
                            groups={groups}
                            hasDirectAccess={Boolean(membership)}
                            getRoleName={getRoleName}
                            isOpen={openGroupPopoverUserId === u.id}
                            keepFocusOnClose={
                              openGroupPopoverUserId !== null && openGroupPopoverUserId !== u.id
                            }
                            onOpenChange={(isOpen) =>
                              setOpenGroupPopoverUserId((current) => {
                                if (isOpen) return u.id;
                                return current === u.id ? null : current;
                              })
                            }
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {membership ? (
                          <OrgPermissionCan
                            I={OrgPermissionMemberActions.Edit}
                            a={OrgPermissionSubjects.Member}
                          >
                            {(isAllowed) => (
                              <Select
                                value={getRoleSlug(membership)}
                                onValueChange={(selectedRole) =>
                                  onRoleChange(membership.id, selectedRole)
                                }
                                disabled={isSelf || !isAllowed}
                              >
                                <SelectTrigger
                                  size="sm"
                                  className="w-full max-w-32 lg:max-w-64"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-w-32 lg:max-w-60">
                                  {(roles || [])
                                    .filter(({ slug }) =>
                                      slug === "owner"
                                        ? isIamOwner || membership.role === "owner"
                                        : true
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
                        ) : (
                          <span className="text-muted">No direct access</span>
                        )}
                      </TableCell>
                      <TableCell variant="action">
                        <div className="flex items-center justify-end gap-6">
                          {membership &&
                            isActive &&
                            (membership.status === "invited" || membership.status === "verified") &&
                            email &&
                            !isSubOrganization &&
                            serverDetails?.emailConfigured && (
                              <OrgPermissionCan
                                I={OrgPermissionMemberActions.Create}
                                a={OrgPermissionSubjects.Member}
                              >
                                {(isAllowed) => (
                                  <Button
                                    isDisabled={!isAllowed || isResendInvitePending}
                                    variant={isSubOrganization ? "sub-org" : "org"}
                                    size="xs"
                                    isPending={
                                      isResendInvitePending && resendInviteId === membership.id
                                    }
                                    onClick={(e) => {
                                      onResendInvite(membership.id);
                                      e.stopPropagation();
                                    }}
                                  >
                                    <MailIcon />
                                    Resend Invite
                                  </Button>
                                )}
                              </OrgPermissionCan>
                            )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton variant="ghost" size="xs" isDisabled={isSelf}>
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              {membership ? (
                                <>
                                  <OrgPermissionCan
                                    I={OrgPermissionMemberActions.Edit}
                                    a={OrgPermissionSubjects.Member}
                                  >
                                    {(isAllowed) => (
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate({
                                            to: "/organizations/$orgId/members/$membershipId",
                                            params: { membershipId: membership.id, orgId }
                                          });
                                        }}
                                        isDisabled={!isAllowed}
                                      >
                                        <PencilIcon />
                                        Edit User
                                      </DropdownMenuItem>
                                    )}
                                  </OrgPermissionCan>
                                  <OrgPermissionCan
                                    I={OrgPermissionMemberActions.Edit}
                                    a={OrgPermissionSubjects.Member}
                                  >
                                    {(isAllowed) => (
                                      <DropdownMenuItem
                                        onClick={async (e) => {
                                          e.stopPropagation();

                                          if (!isActive) {
                                            await updateOrgMembership({
                                              organizationId: orgId,
                                              membershipId: membership.id,
                                              isActive: true
                                            });

                                            return;
                                          }

                                          handlePopUpOpen("deactivateMember", {
                                            orgMembershipId: membership.id,
                                            username
                                          });
                                        }}
                                        isDisabled={!isAllowed}
                                      >
                                        <UserMinusIcon />
                                        {`${isActive ? "Deactivate" : "Activate"} User`}
                                      </DropdownMenuItem>
                                    )}
                                  </OrgPermissionCan>
                                  <OrgPermissionCan
                                    I={OrgPermissionMemberActions.Delete}
                                    a={OrgPermissionSubjects.Member}
                                  >
                                    {(isAllowed) => (
                                      <DropdownMenuItem
                                        variant="danger"
                                        onClick={(e) => {
                                          e.stopPropagation();

                                          handlePopUpOpen("removeMember", {
                                            orgMembershipId: membership.id,
                                            username
                                          });
                                        }}
                                        isDisabled={!isAllowed}
                                      >
                                        <UserXIcon />
                                        Remove User
                                      </DropdownMenuItem>
                                    )}
                                  </OrgPermissionCan>
                                </>
                              ) : (
                                <OrgPermissionCan
                                  I={OrgPermissionMemberActions.Create}
                                  a={OrgPermissionSubjects.Member}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onInviteAsDirectMember(username);
                                      }}
                                      isDisabled={!isAllowed || isInviteDirectMemberPending}
                                    >
                                      <UserPlusIcon />
                                      Invite as Direct Member
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
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
        </>
      )}
    </div>
  );
};
