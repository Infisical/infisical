import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";

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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import { type AuthMethod, authMethodNames, type OrgIdentity, roleName } from "../model";
import { type AccessColumn, AccessTable } from "../table";
import { Gate, Muted, useCan, usePagedList } from "../ui";
import {
  AuthMethodFormSheet,
  AuthMethodViewSheet,
  LockBadge,
  lockedMethods,
  RemoveAuthMethodDialog
} from "./auth-methods";
import { AuthTemplatesSection } from "./auth-templates";
import { CreateIdentitySheet } from "./create-identity-sheet";
import { reapIdentity } from "./memberships";

import styles from "../access.module.css";
import css from "./org.module.css";

export { OrgIdentityDetail } from "./identity-detail";

type ScopeTab = "organization" | "project" | "all";

const UNITS: Record<string, number> = { second: 1 / 60, minute: 1, hour: 60, day: 1440 };
const minutesAgo = (value?: string) => {
  const match = value?.match(/^(\d+) (second|minute|hour|day)s? ago$/);
  return match ? Number(match[1]) * UNITS[match[2]] : Number.POSITIVE_INFINITY;
};

export const OrgIdentitiesTab = () => {
  const { data, update, saved, toast, loading, navigate, startsWith } = useAccess();
  const can = useCan("org");
  const [scope, setScope] = useState<ScopeTab>("organization");
  const [creating, setCreating] = useState(() => startsWith("create"));
  const [deleting, setDeleting] = useState<OrgIdentity>();
  const [authForm, setAuthForm] = useState<{ identity: OrgIdentity; method?: AuthMethod }>();
  const [authView, setAuthView] = useState<{ identity: OrgIdentity; method: AuthMethod }>();
  const [removingAuth, setRemovingAuth] = useState<{ identity: OrgIdentity; method: AuthMethod }>();

  const counts = {
    organization: data.orgIdentities.filter((i) => !i.managedByProject).length,
    project: data.orgIdentities.filter((i) => i.managedByProject).length
  };
  const rows = useMemo(
    () =>
      data.orgIdentities.filter(
        (identity) =>
          scope === "all" || (scope === "project") === Boolean(identity.managedByProject)
      ),
    [data.orgIdentities, scope]
  );
  const list = usePagedList({
    rows,
    perPage: 10,
    initialSort: { columnId: "name", direction: "asc" },
    matches: (identity, needle) =>
      [identity.name, identity.role, roleName(data.orgRoles, identity.role)].some((value) =>
        value.toLowerCase().includes(needle)
      ),
    compare: (a, b, column) => {
      if (column === "lastUsed") return minutesAgo(b.lastLogin) - minutesAgo(a.lastLogin);
      if (column === "role")
        return roleName(data.orgRoles, a.role).localeCompare(roleName(data.orgRoles, b.role));
      return a.name.localeCompare(b.name);
    }
  });
  const searching = Boolean(list.search.trim());
  const live = (identity: OrgIdentity) =>
    data.orgIdentities.find((item) => item.id === identity.id) ?? identity;

  const openDetail = (identity: OrgIdentity) =>
    identity.managedByProject
      ? navigate({ scope: "project", projectTab: "identities" })
      : navigate({
          detail: { kind: "org-identity", id: identity.id, label: identity.name, mono: true }
        });

  const columns: AccessColumn<OrgIdentity>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      width: "25%",
      render: (identity) => <span>{identity.name}</span>
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      width: "25%",
      render: (identity) => <Badge tone="soft">{roleName(data.orgRoles, identity.role)}</Badge>
    },
    {
      id: "managedBy",
      header: "Managed by",
      width: "25%",
      render: (identity) =>
        identity.managedByProject ? (
          <Badge tone="outline">
            <Icon name="folder" size={12} />
            {identity.managedByProject}
          </Badge>
        ) : (
          <Badge tone="outline">
            <Icon name="building" size={12} />
            Organization
          </Badge>
        )
    },
    {
      id: "lastUsed",
      header: "Last used",
      sortable: true,
      render: (identity) =>
        identity.lastLogin && identity.authMethods.length ? (
          <Tooltip
            content={`Last login with ${authMethodNames[identity.authMethods[0]]}, ${identity.lastLogin}`}
          >
            <span>{identity.lastLogin.replace(/^(\d+) seconds? ago$/, "Just now")}</span>
          </Tooltip>
        ) : (
          <Muted>{identity.lastLogin ?? "Never"}</Muted>
        )
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (identity) => {
        const locked = lockedMethods(identity);
        return (
          <>
            {locked.length > 0 && (
              <LockBadge
                label={`Locked out: ${locked.map((m) => authMethodNames[m]).join(", ")}`}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                  {`Actions for ${identity.name}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {identity.managedByProject ? (
                  <DropdownMenuItem onSelect={() => openDetail(identity)}>
                    <Icon name="external" />
                    Open in project
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      disabled={!can("identity", "edit")}
                      onSelect={() => openDetail(identity)}
                    >
                      <Icon icon={PencilIcon} />
                      Edit machine identity
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Icon name="key" />
                        Manage auth methods
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {identity.authMethods.map((method) => (
                          <DropdownMenuItem
                            key={method}
                            onSelect={() => setAuthView({ identity, method })}
                          >
                            {authMethodNames[method]}
                            {locked.includes(method) && <Icon name="lock" />}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          disabled={!can("identity", "edit")}
                          onSelect={() => setAuthForm({ identity })}
                        >
                          <Icon name="plus" />
                          Add auth method
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!can("identity", "delete")}
                      onSelect={() => setDeleting(identity)}
                    >
                      <Icon name="trash" />
                      Delete machine identity
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        );
      }
    }
  ];

  const scopeLabel = scope === "project" ? "project" : "organization";
  let empty = {
    title: "No machine identities have been added to this organization",
    description: "Add a machine identity to get started."
  };
  if (searching)
    empty = {
      title:
        scope === "all"
          ? "No machine identities match your search"
          : `No ${scopeLabel} machine identities match your search`,
      description: "Try adjusting your search."
    };
  else if (scope === "project")
    empty = {
      title: "No project machine identities found",
      description: "Machine identities scoped to a project will appear here."
    };

  return (
    <Stack gap={32}>
      <Stack gap={16}>
        <div className={styles.toolbar}>
          <div className={css.toolbarTabs}>
            <Tabs
              variant="segmented"
              label="Machine identity scope"
              value={scope}
              onChange={(value) => {
                setScope(value as ScopeTab);
                list.resetPage();
              }}
              tabs={[
                { value: "organization", label: "Org", count: counts.organization },
                { value: "project", label: "Project", count: counts.project },
                { value: "all", label: "All", count: counts.organization + counts.project }
              ]}
            />
          </div>
          <div className={styles.grow}>
            <Input
              icon="search"
              placeholder="Search machine identities by name or role..."
              aria-label="Search machine identities by name or role"
              value={list.search}
              onChange={(event) => list.setSearch(event.target.value)}
            />
          </div>
          <Gate allowed={can("identity", "create")}>
            <Button
              variant="primary"
              icon="plus"
              disabled={!can("identity", "create")}
              onClick={() => setCreating(true)}
            >
              Create
            </Button>
          </Gate>
        </div>
        <Stack gap={8}>
          <AccessTable
            label="Organization machine identities"
            rows={list.pageRows}
            columns={columns}
            getRowId={(identity) => identity.id}
            rowLabel={(identity) => identity.name}
            loading={loading ? 10 : undefined}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={openDetail}
            empty={
              <EmptyState
                size="sm"
                icon={searching ? "search" : "machine"}
                title={empty.title}
                description={empty.description}
              />
            }
          />
          {!loading && list.pagination}
        </Stack>
      </Stack>
      <AuthTemplatesSection />
      <CreateIdentitySheet open={creating} onOpenChange={setCreating} />
      {authForm && (
        <AuthMethodFormSheet
          key={`${authForm.identity.id}-${authForm.method ?? "new"}`}
          identity={live(authForm.identity)}
          method={authForm.method}
          open
          onOpenChange={(open) => !open && setAuthForm(undefined)}
        />
      )}
      {authView && (
        <AuthMethodViewSheet
          identity={live(authView.identity)}
          method={authView.method}
          open
          onOpenChange={(open) => !open && setAuthView(undefined)}
          onEdit={() => {
            setAuthForm(authView);
            setAuthView(undefined);
          }}
          onRemove={() => {
            setRemovingAuth(authView);
            setAuthView(undefined);
          }}
        />
      )}
      {removingAuth && (
        <RemoveAuthMethodDialog
          identity={removingAuth.identity}
          method={removingAuth.method}
          onClose={() => setRemovingAuth(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${deleting?.name ?? "machine identity"}?`}</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                setDeleting(undefined);
                if (deleting.hasDeleteProtection) {
                  toast({
                    tone: "bad",
                    title: "Failed to delete machine identity",
                    description:
                      "Delete protection is enabled for this machine identity. Turn it off before deleting it."
                  });
                  return;
                }
                update((current) => reapIdentity(current, deleting.id));
                saved("Successfully deleted machine identity");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
