import { useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { UserCogIcon } from "lucide-react";

import { InstanceUserManagementUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import type { User } from "@app/hooks/api/users/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useUpgradeGate } from "../../license";
import { ConfirmDialog, fullName, Muted, pagination, usePageReset, usePaging } from "./shared";

import styles from "./ResourceOverviewPage.module.css";

const ADMINS_ONLY = "admins";

const usernameOf = (user: User) => user.username || user.email || "";

export const UsersTab = () => {
  const admin = useV4Adapter("admin");
  const session = useV4Session();
  const { data: subscription } = admin.useSubscription(session.organization.id);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const adminsOnly = filters.some((filter) => filter.values.includes(ADMINS_ONLY));
  const paging = usePaging("ResourceOverviewUsersTable", 20);
  const { data, isPending, error } = admin.useUsers({
    limit: paging.perPage,
    offset: paging.offset,
    searchTerm: debouncedSearch,
    adminsOnly
  });
  const users = data?.users ?? [];
  const totalCount = data?.totalCount ?? 0;
  usePageReset(paging, totalCount);
  const deleteUser = admin.useDeleteUser();
  const deleteUsers = admin.useBulkDeleteUsers();
  const grantAdmin = admin.useGrantServerAdminAccess();
  const removeAdmin = admin.useRemoveServerAdminAccess();
  const [selected, setSelected] = useState<User[]>([]);
  const [deleting, setDeleting] = useState<User>();
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [granting, setGranting] = useState<User>();
  const [revoking, setRevoking] = useState<User>();

  if (error) throw error;

  const isSelf = (user: User) => user.id === session.user.id;
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const withLicense = (action: () => void) => () =>
    subscription?.instanceUserManagement
      ? action()
      : openUpgradeGate({
          intent: InstanceUserManagementUpgradeIntent,
          paywallKey: "admin.user-identities"
        });

  const columns: DataTableColumn<User>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (user) => fullName(user) ?? "",
      render: (user) => (
        <Inline gap={8} align="center" wrap={false}>
          <span>{fullName(user) ?? <Muted>Not set</Muted>}</span>
          {user.superAdmin && (
            <Badge tone="info">
              <Icon icon={UserCogIcon} size={12} />
              Server admin
            </Badge>
          )}
        </Inline>
      )
    },
    { id: "username", header: "Username", grow: true, render: usernameOf }
  ];

  const rowActions: DataTableRowActions<User> = {
    menuLabel: "User options",
    renderMenu: (user) => (
      <>
        {!user.superAdmin && (
          <>
            <DropdownMenuItem onSelect={withLicense(() => setGranting(user))}>
              <Icon icon={UserCogIcon} />
              Make server admin
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {user.superAdmin && (
          <DropdownMenuItem variant="destructive" onSelect={withLicense(() => setRevoking(user))}>
            <Icon icon={UserCogIcon} />
            Remove server admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(user)}>
          <Icon name="trash" />
          Delete user
        </DropdownMenuItem>
      </>
    )
  };

  const pageIds = new Set(users.map((user) => user.id));

  return (
    <Stack gap={16}>
      <FilterBar
        label="User filters"
        fields={[
          {
            key: "access",
            label: "Access level",
            type: "select",
            options: [{ value: ADMINS_ONLY, label: "Server admins" }]
          }
        ]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          paging.setPage(1);
        }}
        search={
          <Input
            icon="search"
            aria-label="Search users"
            placeholder="Search users..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              paging.setPage(1);
            }}
          />
        }
      />
      <DataTable
        label="Users"
        rows={users}
        columns={columns}
        loading={isPending}
        loadingRows={10}
        getRowId={(user) => user.id}
        rowLabel={usernameOf}
        rowActions={rowActions}
        selectable
        selectedIds={selected.map((user) => user.id)}
        onSelectionChange={(ids) =>
          setSelected((current) => [
            ...current.filter((user) => !pageIds.has(user.id)),
            ...users.filter((user) => ids.includes(user.id))
          ])
        }
        actionBar={
          <FloatingActionBar
            label="Selected user actions"
            count={selected.length}
            onClear={() => setSelected([])}
            noun={selected.length === 1 ? "user" : "users"}
            actions={[
              {
                label: "Delete",
                icon: "trash",
                danger: true,
                onClick: () => selected.length && setBulkDeleting(true)
              }
            ]}
          />
        }
        empty={
          debouncedSearch || adminsOnly ? (
            <EmptyState size="sm" icon="search" title="No users match these filters" />
          ) : (
            <EmptyState size="sm" icon="user" title="No users found" />
          )
        }
        pagination={pagination(paging, totalCount, "User pages")}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete user ${deleting ? usernameOf(deleting) : ""}?`}
        description={
          deleting && isSelf(deleting)
            ? "You are deleting your own account. This action is irreversible."
            : undefined
        }
        confirmText="remove"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteUser.mutateAsync(deleting.id);
          setSelected((current) => current.filter((user) => user.id !== deleting.id));
          saved("Successfully deleted user");
        }}
      />
      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title="Delete the following users?"
        confirmText="confirm"
        onConfirm={async () => {
          await deleteUsers.mutateAsync(selected.map((user) => user.id));
          setSelected([]);
          saved("Successfully removed users");
        }}
      >
        <ul className={styles.userList}>
          {selected.map((user) => {
            const name = fullName(user);
            const email = user.email ?? user.username;
            return (
              <li key={user.id}>
                <span>{name ? `${name} (${email})` : email}</span>
                {isSelf(user) && (
                  <Tooltip content="Are you sure you want to remove yourself from this instance?">
                    <Badge tone="bad">
                      <Icon name="alert" size={12} />
                      Deleting yourself
                    </Badge>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(granting)}
        onOpenChange={(open) => !open && setGranting(undefined)}
        tone="neutral"
        title={`Grant server admin access to ${granting ? usernameOf(granting) : ""}?`}
        description="This grants instance-wide administrative access. You can remove it later."
        confirmText="confirm"
        actionLabel="Grant access"
        onConfirm={async () => {
          if (!granting) return;
          await grantAdmin.mutateAsync(granting.id);
          saved("Successfully granted server admin access to user");
        }}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && setRevoking(undefined)}
        title={`Remove server admin access from ${revoking ? usernameOf(revoking) : ""}?`}
        description="You can grant server admin access again later."
        confirmText="confirm"
        actionLabel="Remove access"
        onConfirm={async () => {
          if (!revoking) return;
          await removeAdmin.mutateAsync(revoking.id);
          saved("Successfully removed server admin access from user");
        }}
      />
      {upgradeGate}
    </Stack>
  );
};
