import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon, MailIcon, UserCogIcon, UsersIcon } from "lucide-react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Select } from "@app/components/v4/ui/select";
import { Separator } from "@app/components/v4/ui/separator";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { findOrgMembershipRole } from "@app/helpers/roles";
import type { TOrgRole } from "@app/hooks/api/roles/types";
import type { TOrgUserAccess } from "@app/hooks/api/users/types";

import { useV4Adapter } from "../../data/adapters";
import { accessLinks } from "../links";
import { useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDateTime, orgRoleName, orgRoleSlug } from "../roles";
import { failed, saved } from "../toast";
import { Gate, Muted, usePagedList, RESTRICTED } from "../ui";
import { type InviteLink, InviteUsersSheet } from "./invite-users-sheet";
import { displayName, useIsSelf } from "./users";

import styles from "../access.module.css";

const GROUP_ONLY = "Access is managed through groups";

const SELF_REASON = "You cannot modify your own membership";

const usernameOf = (member: TOrgUserAccess) =>
  member.user.username || member.membership?.inviteEmail || member.user.email || "";

const emailOf = (member: TOrgUserAccess) =>
  member.user.email || member.membership?.inviteEmail || member.user.username;

const GroupAccessPopover = ({
  member,
  roles,
  onOpenGroup
}: {
  member: TOrgUserAccess;
  roles: readonly TOrgRole[];
  onOpenGroup: (id: string) => void;
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" aria-label="Show groups granting access">
        <Icon icon={UsersIcon} />
        {member.groups.length}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" style={{ width: 320 }}>
      <Stack gap={12}>
        <strong>Access details</strong>
        <Stack gap={8}>
          {member.groups.map((group) => (
            <div key={group.id} className={styles.groupRow}>
              <Button variant="link" onClick={() => onOpenGroup(group.id)}>
                {group.name}
              </Button>
              <span className={styles.roles}>
                {group.roles.slice(0, 2).map((role) => (
                  <Badge key={role.roleId ?? role.role} tone="soft">
                    {orgRoleName(roles, role)}
                  </Badge>
                ))}
                {group.roles.length > 2 && (
                  <Tooltip
                    content={group.roles
                      .slice(2)
                      .map((role) => orgRoleName(roles, role))
                      .join(", ")}
                  >
                    <Badge tone="outline">{`+${group.roles.length - 2}`}</Badge>
                  </Tooltip>
                )}
              </span>
            </div>
          ))}
        </Stack>
        {!member.membership && (
          <>
            <Separator />
            <Muted>Remove this user from the groups to revoke access.</Muted>
          </>
        )}
      </Stack>
    </PopoverContent>
  </Popover>
);

export const OrgMembersTab = () => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const isSelf = useIsSelf();
  const { permission } = useOrgPermission();
  const can = (action: OrgPermissionMemberActions) =>
    permission.can(action, OrgPermissionSubjects.Member);
  const { data: members = [], isPending: membersPending } = access.useOrgUsers(orgId);
  const { data: roles = [], isPending: rolesPending } = access.useOrgRoles(orgId);
  const { data: organization } = access.useOrganization(orgId);
  const updateMembership = access.useUpdateOrgMembership();
  const deleteMembership = access.useDeleteOrgMembership();
  const deleteMemberships = access.useDeleteOrgMemberships();
  const inviteUsers = access.useInviteOrgUsers();
  const resendInvite = access.useResendOrgInvite();
  const loading = membersPending || rolesPending;
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const roleFilter = useMemo(
    () => filters.find((filter) => filter.field === "role")?.values ?? [],
    [filters]
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [inviting, setInviting] = useState<{ links?: readonly InviteLink[] }>();
  const { action } = useSearch({ strict: false }) as { action?: string };
  const navigate = useNavigate();
  const canInvite = can(OrgPermissionMemberActions.Create);
  useEffect(() => {
    if (action !== "invite-members") return;
    if (canInvite) setInviting({});
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, action: "" }),
      replace: true
    } as never);
  }, [action, canInvite, navigate]);
  const [removing, setRemoving] = useState<TOrgUserAccess>();
  const [deactivating, setDeactivating] = useState<TOrgUserAccess>();
  const [bulkRemoving, setBulkRemoving] = useState<TOrgUserAccess[]>();

  const rows = useMemo(
    () =>
      members.filter((member) => {
        if (!roleFilter.length) return true;
        const refs = [
          ...(member.membership ? [member.membership] : []),
          ...member.groups.flatMap((group) => group.roles)
        ];
        return refs.some((ref) => roleFilter.includes(orgRoleSlug(roles, ref)));
      }),
    [members, roles, roleFilter]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [
        member.user.firstName,
        member.user.lastName,
        member.user.username,
        member.user.email,
        member.membership?.inviteEmail
      ].some((value) => value?.toLowerCase().includes(needle)),
    compare: (a, b, column) => {
      const value = (member: TOrgUserAccess) => {
        if (column === "username") return emailOf(member);
        if (column === "role")
          return member.membership ? orgRoleSlug(roles, member.membership) : "";
        return member.user.firstName ?? "";
      };
      const [first, second] = [value(a), value(b)];
      if (!first || !second) return Number(!first) - Number(!second);
      return first.toLowerCase().localeCompare(second.toLowerCase());
    }
  });

  const openMember = (member: TOrgUserAccess) =>
    member.membership && go(accessLinks.orgMember(orgId, member.membership.id));

  const updateMember = async (
    membershipId: string,
    patch: { role?: string; isActive?: boolean },
    success: string
  ) => {
    try {
      await updateMembership.mutateAsync({ organizationId: orgId, membershipId, ...patch });
      saved(success);
    } catch (error) {
      failed("Failed to update user", error);
    }
  };

  const inviteAsDirectMember = async (member: TOrgUserAccess) => {
    const defaultRole = organization
      ? findOrgMembershipRole([...roles], organization.defaultMembershipRole)
      : undefined;
    try {
      const { data } = await inviteUsers.mutateAsync({
        organizationId: orgId,
        inviteeEmails: [member.user.username],
        organizationRoleSlug: defaultRole?.slug ?? "member"
      });
      if (data.completeInviteLinks?.length) {
        setInviting({ links: data.completeInviteLinks });
        return;
      }
      saved("Successfully invited user to the organization.");
    } catch (error) {
      failed("Failed to invite user", error);
    }
  };

  const resend = async (membershipId: string) => {
    try {
      const signupToken = await resendInvite.mutateAsync({ membershipId });
      if (signupToken) {
        setInviting({ links: [signupToken] });
        return;
      }
      saved("Successfully resent org invitation");
    } catch (error) {
      failed("Failed to resend org invitation", error);
    }
  };

  const removeMembers = async (membershipIds: string[], success: string) => {
    try {
      if (membershipIds.length === 1)
        await deleteMembership.mutateAsync({ orgId, membershipId: membershipIds[0] });
      else await deleteMemberships.mutateAsync({ orgId, membershipIds });
      saved(success);
      return true;
    } catch (error) {
      failed("Failed to remove users", error);
      return false;
    }
  };

  const columns: DataTableColumn<TOrgUserAccess>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      render: (member) => (
        <RowLink
          link={go.link(
            member.membership ? accessLinks.orgMember(orgId, member.membership.id) : undefined
          )}
          title={displayName(member.user) ?? undefined}
        >
          {displayName(member.user) ?? <Muted>-</Muted>}
          {(member.membership?.isActive === false || member.user.superAdmin) && (
            <span className={styles.linkBadges}>
              {member.membership?.isActive === false && <Badge>Deactivated</Badge>}
              {member.user.superAdmin && (
                <Tooltip content="Server admin">
                  <Badge tone="info">
                    <Icon icon={UserCogIcon} size={12} />
                    Server admin
                  </Badge>
                </Tooltip>
              )}
            </span>
          )}
        </RowLink>
      )
    },
    {
      id: "username",
      header: "Username",
      sortable: true,
      grow: true,
      render: (member) => (
        <Inline gap={8} wrap={false}>
          <span>{usernameOf(member)}</span>
          {member.membership?.lastLoginAuthMethod && member.membership.lastLoginTime && (
            <Tooltip
              content={`Last login with ${member.membership.lastLoginAuthMethod} on ${formatDateTime(member.membership.lastLoginTime)}`}
            >
              <button type="button" className={styles.rowHint} aria-label="Last login">
                <Icon icon={InfoIcon} size={14} />
              </button>
            </Tooltip>
          )}
        </Inline>
      )
    },
    {
      id: "groups",
      header: "Groups",
      width: 96,
      render: (member) =>
        member.groups.length ? (
          <span onClick={(event) => event.stopPropagation()} role="presentation">
            <GroupAccessPopover
              member={member}
              roles={roles}
              onOpenGroup={(id) => go(accessLinks.orgGroup(orgId, id))}
            />
          </span>
        ) : (
          <Muted>-</Muted>
        )
    },
    {
      id: "role",
      header: "Organization role",
      sortable: true,
      render: (member) => {
        const { membership } = member;
        if (!membership) return <Muted>No direct access</Muted>;
        const self = isSelf(member.user);
        const canEdit = can(OrgPermissionMemberActions.Edit);
        return (
          <span
            className={styles.roleSelect}
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <Gate allowed={canEdit || self}>
              <Select
                size="sm"
                label={`Organization role for ${usernameOf(member)}`}
                value={orgRoleSlug(roles, membership)}
                disabled={self || !canEdit}
                options={roles.map((role) => ({ value: role.slug, label: role.name }))}
                onChange={(role) =>
                  updateMember(membership.id, { role }, "Successfully updated user role")
                }
              />
            </Gate>
          </span>
        );
      }
    }
  ];

  const rowActions: DataTableRowActions<TOrgUserAccess> = {
    menuDisabledReason: (member) => (isSelf(member.user) ? SELF_REASON : undefined),
    renderMenu: (member) => {
      const { membership } = member;
      const canRemove = can(OrgPermissionMemberActions.Delete);
      const removeReason = membership ? undefined : GROUP_ONLY;
      const remove = (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={Boolean(removeReason) || !canRemove}
            description={removeReason ?? (canRemove ? undefined : RESTRICTED)}
            onSelect={() => setRemoving(member)}
          >
            <Icon name="trash" />
            Remove user
          </DropdownMenuItem>
        </>
      );
      if (!membership)
        return (
          <>
            <DropdownMenuItem
              disabled={!can(OrgPermissionMemberActions.Create)}
              description={can(OrgPermissionMemberActions.Create) ? undefined : RESTRICTED}
              onSelect={() => inviteAsDirectMember(member)}
            >
              <Icon name="user-plus" />
              Invite as direct member
            </DropdownMenuItem>
            {remove}
          </>
        );
      const pending =
        membership.isActive &&
        (membership.status === "invited" || membership.status === "verified");
      return (
        <>
          <DropdownMenuItem
            disabled={!can(OrgPermissionMemberActions.Edit)}
            description={can(OrgPermissionMemberActions.Edit) ? undefined : RESTRICTED}
            onSelect={() => openMember(member)}
          >
            <Icon name="settings" />
            Edit user
          </DropdownMenuItem>
          {pending && (
            <DropdownMenuItem
              disabled={!can(OrgPermissionMemberActions.Create)}
              description={can(OrgPermissionMemberActions.Create) ? undefined : RESTRICTED}
              onSelect={() => resend(membership.id)}
            >
              <Icon icon={MailIcon} />
              Resend invite
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!can(OrgPermissionMemberActions.Edit)}
            description={can(OrgPermissionMemberActions.Edit) ? undefined : RESTRICTED}
            onSelect={() => {
              if (!membership.isActive) {
                updateMember(
                  membership.id,
                  { isActive: true },
                  "Successfully activated user in organization"
                );
                return;
              }
              setDeactivating(member);
            }}
          >
            <Icon name="user" />
            {membership.isActive ? "Deactivate user" : "Activate user"}
          </DropdownMenuItem>
          {remove}
        </>
      );
    }
  };

  const direct = members.flatMap((member) => (member.membership ? [member.membership.id] : []));
  const selectedMembers = members.filter(
    (member) => member.membership && selected.includes(member.membership.id)
  );
  const searching = Boolean(list.search.trim() || roleFilter.length);
  const canCreate = can(OrgPermissionMemberActions.Create);

  return (
    <Stack gap={16}>
      <FilterBar
        label="Organization user filters"
        fields={[
          {
            key: "role",
            label: "Organization role",
            type: "multi-select",
            options: roles.map((role) => ({ value: role.slug, label: role.name }))
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          list.resetPage();
        }}
        search={
          <Input
            icon="search"
            aria-label="Search organization users..."
            placeholder="Search organization users..."
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
        actions={
          <Gate allowed={canCreate}>
            <Button
              variant="accent"
              icon="user-plus"
              disabled={!canCreate}
              onClick={() => setInviting({})}
            >
              Invite
            </Button>
          </Gate>
        }
      />
      <DataTable
        label="Organization users"
        rows={list.pageRows}
        columns={columns}
        rowActions={rowActions}
        getRowId={(member) => member.membership?.id ?? member.user.id}
        rowLabel={usernameOf}
        loading={loading}
        loadingRows={10}
        sort={list.sort}
        onSortChange={list.setSort}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        actionBar={
          <FloatingActionBar
            label="Selected user actions"
            count={selected.length}
            total={direct.length}
            onSelectAll={() => setSelected(direct)}
            onClear={() => setSelected([])}
            noun={selected.length === 1 ? "user" : "users"}
            actions={[
              {
                label: "Delete",
                icon: "trash",
                danger: true,
                disabled: !can(OrgPermissionMemberActions.Delete),
                onClick: () => selectedMembers.length && setBulkRemoving(selectedMembers)
              }
            ]}
          />
        }
        selectionDisabledReason={(member) => (member.membership ? undefined : GROUP_ONLY)}
        empty={
          searching ? (
            <EmptyState size="sm" icon="search" title="No organization users match search" />
          ) : (
            <EmptyState size="sm" icon="user" title="No organization users found" />
          )
        }
        pagination={loading ? undefined : list.pagination}
      />

      <InviteUsersSheet
        key={inviting?.links ? "links" : "form"}
        open={Boolean(inviting)}
        links={inviting?.links}
        onOpenChange={(open) => !open && setInviting(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove member with username ${removing ? usernameOf(removing) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>They lose access to the organization.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (removing?.membership)
                  await removeMembers(
                    [removing.membership.id],
                    "Successfully removed user from org"
                  );
                setRemoving(undefined);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to deactivate member with username ${deactivating ? usernameOf(deactivating) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>They lose access until reactivated.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (deactivating?.membership)
                  await updateMember(
                    deactivating.membership.id,
                    { isActive: false },
                    "Successfully deactivated user in organization"
                  );
                setDeactivating(undefined);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(bulkRemoving)}
        onOpenChange={(open) => !open && setBulkRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to remove the following members?
            </AlertDialogTitle>
            <AlertDialogDescription>They lose access to the organization.</AlertDialogDescription>
          </AlertDialogHeader>
          <Stack gap={8}>
            <ul className={styles.removeList}>
              {bulkRemoving?.map((member) => {
                const self = isSelf(member.user);
                const name = displayName(member.user);
                const email = emailOf(member);
                return (
                  <li key={member.user.id} data-ignored={self || undefined}>
                    <span>{name ? `${name} (${email})` : email}</span>
                    {self && (
                      <Tooltip content="You cannot remove yourself from this organization">
                        <Badge tone="bad">Ignored</Badge>
                      </Tooltip>
                    )}
                  </li>
                );
              })}
            </ul>
          </Stack>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const ids = (bulkRemoving ?? [])
                  .filter((member) => !isSelf(member.user))
                  .flatMap((member) => (member.membership ? [member.membership.id] : []));
                const ok =
                  !ids.length ||
                  (await removeMembers(ids, "Successfully removed users from organization"));
                setBulkRemoving(undefined);
                if (ok) setSelected([]);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
