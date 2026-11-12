import { useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { InstanceUserManagementUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { PageTitle } from "@app/components/PageTitle";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce } from "@app/hooks";
import type { User } from "@app/hooks/api/users/types";

import { saved } from "../../access/toast";
import { Muted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useUpgradeGate } from "../../license";
import { GrantServerAdminDialog } from "./GrantServerAdminDialog";
import { displayName, usernameOf } from "./users";

import styles from "./access-management.module.css";

const PREFERENCE_TABLE = "ServerAdminUsersTable";

export const AccessManagementPage = () => {
  const admin = useV4Adapter("admin");
  const session = useV4Session();
  const { data: subscription } = admin.useSubscription(session.organization.id);
  const deleteUser = admin.useDeleteUser();
  const deleteUsers = admin.useBulkDeleteUsers();
  const removeAdminAccess = admin.useRemoveServerAdminAccess();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    getUserTablePreference(PREFERENCE_TABLE, PreferenceKey.PerPage, 20)
  );
  const [selected, setSelected] = useState<User[]>([]);
  const [granting, setGranting] = useState(false);
  const [removingUser, setRemovingUser] = useState<User>();
  const [removingAdmin, setRemovingAdmin] = useState<User>();
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [pending, setPending] = useState(false);

  const { data, isPending, error } = admin.useUsers({
    limit: pageSize,
    offset: (page - 1) * pageSize,
    searchTerm: debouncedSearch,
    adminsOnly: true
  });
  if (error) throw error;
  const users = data?.users ?? [];
  const totalCount = data?.totalCount ?? 0;

  const run = async (action: () => Promise<unknown>, success: string, close: () => void) => {
    setPending(true);
    const done = await action().then(
      () => true,
      () => false
    );
    setPending(false);
    if (!done) return;
    saved(success);
    close();
  };

  const columns: DataTableColumn<User>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (user) => displayName(user) ?? "",
      render: (user) => displayName(user) ?? <Muted>Not set</Muted>
    },
    {
      id: "username",
      header: "Username",
      grow: true,
      text: usernameOf,
      render: usernameOf
    }
  ];

  return (
    <Stack gap={24}>
      <PageTitle title="Access control" />
      <PageHeader title="Access control" description="Manage server admins on this instance." />
      <Stack gap={16}>
        <FilterBar
          label="Server admin filters"
          fields={[]}
          value={[]}
          onChange={() => undefined}
          search={
            <Input
              icon="search"
              aria-label="Search server admins"
              placeholder="Search admins..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
          actions={
            <Button variant="accent" icon="user-plus" onClick={() => setGranting(true)}>
              Add admin
            </Button>
          }
        />
        <DataTable
          label="Server admins"
          rows={users}
          columns={columns}
          getRowId={(user) => user.id}
          rowLabel={usernameOf}
          loading={isPending}
          loadingRows={10}
          selectable
          selectedIds={selected.map((user) => user.id)}
          onSelectionChange={(ids) =>
            setSelected((current) => [
              ...current.filter(
                (user) => ids.includes(user.id) && !users.some((row) => row.id === user.id)
              ),
              ...users.filter((user) => ids.includes(user.id))
            ])
          }
          rowActions={{
            renderMenu: (user) => (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    subscription?.instanceUserManagement
                      ? setRemovingAdmin(user)
                      : openUpgradeGate({
                          intent: InstanceUserManagementUpgradeIntent,
                          paywallKey: "admin.server-admins"
                        })
                  }
                >
                  <Icon name="lock" />
                  Remove server admin
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setRemovingUser(user)}>
                  <Icon name="trash" />
                  Remove user
                </DropdownMenuItem>
              </>
            )
          }}
          actionBar={
            <FloatingActionBar
              label="Selected server admin actions"
              count={selected.length}
              onClear={() => setSelected([])}
              noun={selected.length === 1 ? "user" : "users"}
              actions={[
                {
                  label: "Delete",
                  icon: "trash",
                  danger: true,
                  onClick: () => selected.length && setBulkRemoving(true)
                }
              ]}
            />
          }
          empty={
            debouncedSearch ? (
              <EmptyState size="sm" icon="search" title="No server admins match search" />
            ) : (
              <EmptyState size="sm" icon="user" title="No users found" />
            )
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Server admin pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                  setUserTablePreference(PREFERENCE_TABLE, PreferenceKey.PerPage, size);
                }}
              />
            ) : undefined
          }
        />
      </Stack>

      <GrantServerAdminDialog open={granting} onOpenChange={setGranting} />

      <AlertDialog
        open={Boolean(removingUser)}
        onOpenChange={(open) => !open && setRemovingUser(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="remove" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to delete user with username ${removingUser ? usernameOf(removingUser) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (!removingUser) return;
                const { id } = removingUser;
                run(
                  () => deleteUser.mutateAsync(id),
                  "Successfully deleted user",
                  () => {
                    setRemovingUser(undefined);
                    setSelected((current) => current.filter((user) => user.id !== id));
                  }
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(removingAdmin)}
        onOpenChange={(open) => !open && setRemovingAdmin(undefined)}
      >
        <AlertDialogContent tone="danger" icon="lock" confirmText="confirm" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to remove server admin permissions from ${removingAdmin ? usernameOf(removingAdmin) : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              You can grant server admin access again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (!removingAdmin) return;
                const { id } = removingAdmin;
                run(
                  () => removeAdminAccess.mutateAsync(id),
                  "Successfully removed server admin access from user",
                  () => {
                    setRemovingAdmin(undefined);
                    setSelected((current) => current.filter((user) => user.id !== id));
                  }
                );
              }}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkRemoving} onOpenChange={setBulkRemoving}>
        <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to delete the following users?
            </AlertDialogTitle>
            <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className={styles.removeList}>
            {selected.map((user) => {
              const name = displayName(user);
              const email = user.email ?? user.username;
              return (
                <li key={user.id}>
                  <span>{name ? `${name} (${email})` : email}</span>
                  {user.id === session.user.id && (
                    <Tooltip content="Are you sure you want to remove yourself from this instance?">
                      <Badge tone="bad">Deleting yourself</Badge>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                run(
                  () => deleteUsers.mutateAsync(selected.map((user) => user.id)),
                  "Successfully removed users",
                  () => {
                    setSelected([]);
                    setBulkRemoving(false);
                  }
                );
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {upgradeGate}
    </Stack>
  );
};
