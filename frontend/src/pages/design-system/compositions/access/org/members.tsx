import { useMemo, useState } from "react";
import { InfoIcon, MailIcon, UserCogIcon, UsersIcon } from "lucide-react";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Select } from "@app/components/v4/ui/select";
import { Separator } from "@app/components/v4/ui/separator";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import { displayName, type OrgMember, type Role, roleName, SELF_USER_ID } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, ListToolbar, Muted, useCan, usePagedList } from "../ui";
import { InviteUsersSheet } from "./invite-users-sheet";

import styles from "../access.module.css";

const GROUP_ONLY = "Access is managed through groups";

const usernameOf = (member: OrgMember) => member.user.username;

const GroupAccessPopover = ({
  member,
  roles,
  onOpenGroup
}: {
  member: OrgMember;
  roles: readonly Role[];
  onOpenGroup: (id: string, name: string) => void;
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
              <Button variant="link" onClick={() => onOpenGroup(group.id, group.name)}>
                {group.name}
              </Button>
              <span className={styles.roles}>
                {group.roles.slice(0, 2).map((role) => (
                  <Badge key={role.role} tone="soft">
                    {roleName(roles, role.role)}
                  </Badge>
                ))}
                {group.roles.length > 2 && (
                  <Tooltip
                    content={group.roles
                      .slice(2)
                      .map((role) => roleName(roles, role.role))
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
  const { data, update, saved, toast, loading, navigate, startsWith } = useAccess();
  const can = useCan("org");
  const roles = data.orgRoles;
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(() => startsWith("filter"));
  const [menuFor, setMenuFor] = useState<string | undefined>(() =>
    startsWith("row-menu") ? "m-marcus" : undefined
  );
  const [selected, setSelected] = useState<string[]>(() =>
    startsWith("bulk") ? ["m-priya", "m-diego", "m-sarah"] : []
  );
  const [inviting, setInviting] = useState(() => startsWith("invite"));
  const [removing, setRemoving] = useState<OrgMember | undefined>(() =>
    startsWith("remove") ? data.orgMembers.find((m) => m.user.id === "u-diego") : undefined
  );
  const [deactivating, setDeactivating] = useState<OrgMember>();
  const [bulkRemoving, setBulkRemoving] = useState<OrgMember[]>();
  const [resending, setResending] = useState<string>();

  const roleRefs = (member: OrgMember) => [
    ...(member.membership ? [member.membership.role] : []),
    ...member.groups.flatMap((group) => group.roles.map((role) => role.role))
  ];
  const rows = useMemo(
    () =>
      data.orgMembers.filter(
        (member) => !roleFilter.length || roleRefs(member).some((r) => roleFilter.includes(r))
      ),
    [data.orgMembers, roleFilter]
  );
  const list = usePagedList({
    rows,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (member, needle) =>
      [member.user.firstName, member.user.lastName, member.user.username, member.user.email].some(
        (value) => value?.toLowerCase().includes(needle)
      ),
    compare: (a, b, column) => {
      const value = (member: OrgMember) => {
        if (column === "username") return member.user.email;
        if (column === "role") return member.membership?.role ?? "";
        return member.user.firstName ?? "";
      };
      return value(a).localeCompare(value(b));
    }
  });

  const setMembership = (id: string, patch: Partial<NonNullable<OrgMember["membership"]>>) =>
    update((current) => ({
      ...current,
      orgMembers: current.orgMembers.map((member) =>
        member.membership?.id === id
          ? { ...member, membership: { ...member.membership, ...patch } }
          : member
      )
    }));
  const removeMembers = (ids: string[]) =>
    update((current) => ({
      ...current,
      orgMembers: current.orgMembers.filter(
        (member) => !member.membership || !ids.includes(member.membership.id)
      )
    }));

  const columns: AccessColumn<OrgMember>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "25%",
      render: (member) => (
        <>
          <span>{displayName(member.user) ?? <Muted>-</Muted>}</span>
          {member.user.superAdmin && (
            <Tooltip content="Server admin">
              <Badge tone="info">
                <Icon icon={UserCogIcon} size={12} />
                Server admin
              </Badge>
            </Tooltip>
          )}
          {member.membership?.lastLogin && (
            <Tooltip
              content={`Last login with ${member.membership.lastLogin.method} on ${member.membership.lastLogin.time}`}
            >
              <button type="button" className={styles.rowHint} aria-label="Last login">
                <Icon icon={InfoIcon} size={14} />
              </button>
            </Tooltip>
          )}
        </>
      )
    },
    {
      id: "username",
      header: "Username",
      sortable: true,
      width: "33%",
      render: (member) => <span>{usernameOf(member)}</span>
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
              onOpenGroup={(id, label) => navigate({ detail: { kind: "org-group", id, label } })}
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
      render: (member) =>
        member.membership ? (
          <span
            className={styles.roleSelect}
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <Gate allowed={can("member", "edit") || member.user.id === SELF_USER_ID}>
              <Select
                size="sm"
                label={`Organization role for ${usernameOf(member)}`}
                value={member.membership.role}
                disabled={member.user.id === SELF_USER_ID || !can("member", "edit")}
                options={roles.map((role) => ({ value: role.slug, label: role.name }))}
                onChange={(role) => {
                  setMembership(member.membership!.id, { role });
                  saved("Successfully updated user role");
                }}
              />
            </Gate>
          </span>
        ) : (
          <Muted>No direct access</Muted>
        )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (member) => {
        const { membership } = member;
        const isSelf = member.user.id === SELF_USER_ID;
        const menuId = membership?.id ?? member.user.id;
        return (
          <>
            {membership &&
              membership.isActive &&
              (membership.status === "invited" || membership.status === "verified") && (
                <Gate allowed={can("member", "create")}>
                  <Button
                    variant="outline"
                    size="xs"
                    loading={resending === membership.id}
                    disabled={!can("member", "create")}
                    onClick={() => {
                      setResending(membership.id);
                      window.setTimeout(() => {
                        setResending(undefined);
                        toast({
                          tone: "ok",
                          title: "Successfully resent org invitation",
                          description: "Local demo only. No email was sent."
                        });
                      }, 600);
                    }}
                  >
                    <Icon icon={MailIcon} size={12} />
                    Resend invite
                  </Button>
                </Gate>
              )}
            <DropdownMenu
              open={menuFor === menuId}
              onOpenChange={(open) => setMenuFor(open ? menuId : undefined)}
            >
              <Gate allowed={!isSelf} reason="You cannot modify your own membership">
                <DropdownMenuTrigger asChild disabled={isSelf}>
                  <Button variant="ghost" size="icon-row" icon="more" iconOnly disabled={isSelf}>
                    {`Actions for ${usernameOf(member)}`}
                  </Button>
                </DropdownMenuTrigger>
              </Gate>
              <DropdownMenuContent align="end">
                {membership ? (
                  <>
                    <DropdownMenuItem
                      disabled={!can("member", "edit")}
                      onSelect={() =>
                        navigate({
                          detail: {
                            kind: "org-member",
                            id: membership.id,
                            label: displayName(member.user) ?? usernameOf(member)
                          }
                        })
                      }
                    >
                      <Icon name="settings" />
                      Edit user
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!can("member", "edit")}
                      onSelect={() => {
                        if (!membership.isActive) {
                          setMembership(membership.id, { isActive: true });
                          saved("Successfully activated user in organization");
                          return;
                        }
                        setDeactivating(member);
                      }}
                    >
                      <Icon name="user" />
                      {membership.isActive ? "Deactivate user" : "Activate user"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!can("member", "delete")}
                      onSelect={() => setRemoving(member)}
                    >
                      <Icon name="trash" />
                      Remove user
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    disabled={!can("member", "create")}
                    onSelect={() => {
                      update((current) => ({
                        ...current,
                        orgMembers: current.orgMembers.map((item) =>
                          item.user.id === member.user.id
                            ? {
                                ...item,
                                membership: {
                                  id: `m-${item.user.id}`,
                                  role: "member",
                                  isActive: true,
                                  status: "invited",
                                  createdAt: "Oct 30, 2026"
                                }
                              }
                            : item
                        )
                      }));
                      saved("Successfully invited user to the organization.");
                    }}
                  >
                    <Icon name="user-plus" />
                    Invite as direct member
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        );
      }
    }
  ];

  const selectedMembers = data.orgMembers.filter(
    (member) => member.membership && selected.includes(member.membership.id)
  );
  const searching = Boolean(list.search.trim() || roleFilter.length);

  return (
    <Stack gap={16}>
      <div className={styles.toolbar}>
        <div className={styles.grow}>
          <ListToolbar
            search={list.search}
            onSearch={list.setSearch}
            placeholder="Search organization users..."
            filter={{
              label: "Filter by organization role",
              open: filterOpen,
              onOpenChange: setFilterOpen,
              options: roles.map((role) => ({ value: role.slug, label: role.name })),
              selected: roleFilter,
              onToggle: (slug) => {
                setRoleFilter((current) =>
                  current.includes(slug) ? current.filter((r) => r !== slug) : [...current, slug]
                );
                list.resetPage();
              }
            }}
          />
        </div>
        <Gate allowed={can("member", "create")}>
          <Button
            variant="primary"
            icon="user-plus"
            disabled={!can("member", "create")}
            onClick={() => setInviting(true)}
          >
            Invite users
          </Button>
        </Gate>
      </div>
      <Stack gap={8}>
        <AccessTable
          label="Organization users"
          rows={list.pageRows}
          columns={columns}
          getRowId={(member) => member.membership?.id ?? member.user.id}
          rowLabel={usernameOf}
          loading={loading ? 10 : undefined}
          sort={list.sort}
          onSortChange={list.setSort}
          isMuted={(member) => member.membership?.isActive === false}
          onRowClick={(member) =>
            member.membership &&
            navigate({
              detail: {
                kind: "org-member",
                id: member.membership.id,
                label: displayName(member.user) ?? usernameOf(member)
              }
            })
          }
          selection={{
            selected,
            onChange: setSelected,
            blockedReason: (member) => (member.membership ? undefined : GROUP_ONLY)
          }}
          empty={
            searching ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No organization users match search"
                description="Adjust your search or filter criteria."
              />
            ) : (
              <EmptyState
                size="sm"
                icon="user"
                title="No organization users found"
                description="Invite users to get started."
              />
            )
          }
        />
        {!loading && list.pagination}
      </Stack>
      <FloatingActionBar
        placement="fixed"
        label="Selected user actions"
        count={selected.length}
        total={data.orgMembers.filter((member) => member.membership).length}
        onSelectAll={() =>
          setSelected(data.orgMembers.flatMap((m) => (m.membership ? [m.membership.id] : [])))
        }
        onClear={() => setSelected([])}
        noun={selected.length === 1 ? "user" : "users"}
        actions={[
          {
            label: "Delete",
            icon: "trash",
            danger: true,
            disabled: !can("member", "delete"),
            onClick: () => selectedMembers.length && setBulkRemoving(selectedMembers)
          }
        ]}
      />
      <InviteUsersSheet open={inviting} onOpenChange={setInviting} />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove member with username ${removing ? usernameOf(removing) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing?.membership) removeMembers([removing.membership.id]);
                setRemoving(undefined);
                saved("Successfully removed user from org");
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
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deactivating?.membership)
                  setMembership(deactivating.membership.id, { isActive: false });
                setDeactivating(undefined);
                saved("Successfully deactivated user in organization");
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
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <Stack gap={8}>
            <Muted>The following members will be removed:</Muted>
            <ul className={styles.removeList}>
              {bulkRemoving?.map((member) => {
                const self = member.user.id === SELF_USER_ID;
                const name = displayName(member.user);
                return (
                  <li key={member.user.id} data-ignored={self || undefined}>
                    <span>{name ? `${name} (${member.user.email})` : member.user.email}</span>
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
              onClick={() => {
                removeMembers(
                  (bulkRemoving ?? [])
                    .filter((member) => member.user.id !== SELF_USER_ID)
                    .flatMap((member) => (member.membership ? [member.membership.id] : []))
                );
                setBulkRemoving(undefined);
                setSelected([]);
                saved("Successfully removed users from organization");
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
