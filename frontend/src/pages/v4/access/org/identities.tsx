import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
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
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tabs } from "@app/components/v4/ui/tabs";
import { StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import type { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import {
  type IdentityMembershipSearchResult,
  SearchIdentitiesScope
} from "@app/hooks/api/identities/types";
import { OrgIdentityOrderBy } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { useV4Adapter } from "../../data/adapters";
import { projectBase } from "../../shell/navigation";
import { accessLinks } from "../links";
import { AccessRowLink, useGo } from "../navigation";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDateTime } from "../roles";
import { failed, saved } from "../toast";
import { Gate, Muted, RoleBadges, type Sort, RESTRICTED } from "../ui";
import {
  type AuthIdentity,
  AuthMethodFormSheet,
  AuthMethodViewSheet,
  authMethodName,
  LockBadge,
  RemoveAuthMethodDialog,
  sortedMethods
} from "./auth-methods";
import { AuthTemplatesSection } from "./auth-templates";
import { CreateIdentitySheet } from "./create-identity-sheet";
import { useDebounced } from "./use-debounced";

import styles from "../access.module.css";
import css from "./org.module.css";

type ScopeTab = "organization" | "project" | "all";
type Row = IdentityMembershipSearchResult;

const TAB_TO_SCOPE: Record<ScopeTab, SearchIdentitiesScope[]> = {
  all: [SearchIdentitiesScope.OrganizationScope, SearchIdentitiesScope.ProjectScope],
  organization: [SearchIdentitiesScope.OrganizationScope],
  project: [SearchIdentitiesScope.ProjectScope]
};

const ORDER_BY: Record<string, OrgIdentityOrderBy> = {
  name: OrgIdentityOrderBy.Name,
  role: OrgIdentityOrderBy.Role,
  lastUsed: OrgIdentityOrderBy.LastLogin
};

export const lastUsedLabel = (lastLoginTime?: string | null) => {
  if (!lastLoginTime) return "Never";
  const date = new Date(lastLoginTime);
  if (Number.isNaN(date.getTime())) return "Never";
  if (Date.now() - date.getTime() < 60_000) return "Just now";
  return `${formatDistanceToNow(date)} ago`;
};

const signInOf = (
  row: Row
): { tone: "ok" | "bad" | "warn" | "neutral"; icon: IconName; label: string } => {
  const locked = row.identity.activeLockoutAuthMethods;
  if (locked.length)
    return {
      tone: "bad",
      icon: "lock",
      label: `${locked.map(authMethodName).join(", ")} locked out`
    };
  if (!row.identity.authMethods.length)
    return { tone: "warn", icon: "alert", label: "No auth method" };
  if (!row.lastLoginTime) return { tone: "neutral", icon: "info", label: "Never signed in" };
  return { tone: "ok", icon: "check-c", label: "Signed in" };
};

const authIdentityOf = (row: Row): AuthIdentity => ({
  id: row.identity.id,
  name: row.identity.name,
  authMethods: row.identity.authMethods,
  activeLockoutAuthMethods: row.identity.activeLockoutAuthMethods
});

export const OrgIdentitiesTab = () => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const go = useGo();
  const { permission } = useOrgPermission();
  const can = (action: OrgPermissionIdentityActions) =>
    permission.can(action, OrgPermissionSubjects.Identity);
  const canCreate = can(OrgPermissionIdentityActions.Create);
  const canEdit = can(OrgPermissionIdentityActions.Edit);
  const canEditAuth = can(OrgPermissionIdentityActions.EditAuth);
  const canDelete = can(OrgPermissionIdentityActions.Delete);
  const [scope, setScope] = useState<ScopeTab>("organization");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Row>();
  const [authForm, setAuthForm] = useState<{
    identity: AuthIdentity;
    method?: IdentityAuthMethod;
  }>();
  const [authView, setAuthView] = useState<{
    identity: AuthIdentity;
    method: IdentityAuthMethod;
  }>();
  const [removingAuth, setRemovingAuth] = useState<{
    identity: AuthIdentity;
    method: IdentityAuthMethod;
  }>();
  const deleteIdentity = access.useDeleteOrgIdentity();
  const debouncedSearch = useDebounced(search.trim());
  const searchPayload = debouncedSearch
    ? { $or: [{ name: { $contains: debouncedSearch } }, { role: { $contains: debouncedSearch } }] }
    : {};
  const { data, isPending } = access.useSearchOrgIdentities({
    orgId,
    offset: (page - 1) * perPage,
    limit: perPage,
    orderBy: ORDER_BY[sort.columnId] ?? OrgIdentityOrderBy.Name,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    scope: TAB_TO_SCOPE[scope],
    search: searchPayload
  });
  const { data: counts } = access.useCountOrgIdentities({
    orgId,
    scope: TAB_TO_SCOPE.all,
    search: searchPayload
  });
  const rows = data?.identities ?? [];
  const totalCount = data?.totalCount ?? 0;
  const searching = Boolean(debouncedSearch);
  const live = (identity: AuthIdentity) => {
    const row = rows.find((entry) => entry.identity.id === identity.id);
    return row ? authIdentityOf(row) : identity;
  };

  const projectHref = (row: Row) => {
    if (!row.project) return accessLinks.org(orgId);
    if (row.project.type === ProjectType.SecretManager || row.project.type === ProjectType.KMS)
      return accessLinks.projectIdentity(
        { orgId, projectId: row.project.id, projectType: row.project.type },
        row.identity.id
      );
    return `/v4/organizations/${orgId}${projectBase(row.project.type, row.project.id)}/access-management?selectedTab=${ProjectAccessControlTabs.Identities}`;
  };
  const isProjectScoped = (row: Row) => row.scope === SearchIdentitiesScope.ProjectScope;
  const openDetail = (row: Row) =>
    go(isProjectScoped(row) ? projectHref(row) : accessLinks.orgIdentity(orgId, row.identity.id));

  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      text: (row) => row.identity.name,
      render: (row) => {
        const locked = row.identity.activeLockoutAuthMethods;
        return (
          <AccessRowLink
            href={
              isProjectScoped(row)
                ? projectHref(row)
                : accessLinks.orgIdentity(orgId, row.identity.id)
            }
            title={row.identity.name}
          >
            {row.identity.name}
            {locked.length > 0 && (
              <span className={styles.linkBadges}>
                <LockBadge label={`Locked out: ${locked.map(authMethodName).join(", ")}`} />
              </span>
            )}
          </AccessRowLink>
        );
      }
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      grow: true,
      render: (row) => <RoleBadges roles={row.roles} />
    },
    {
      id: "managedBy",
      header: "Managed by",
      grow: true,
      render: (row) =>
        isProjectScoped(row) ? (
          <Badge tone="outline">
            <Icon name="folder" size={12} />
            {row.project?.name ?? "Project"}
          </Badge>
        ) : (
          <Badge tone="outline">
            <Icon name="building" size={12} />
            Organization
          </Badge>
        )
    },
    {
      id: "authMethods",
      header: "Auth methods",
      grow: true,
      text: (row) => sortedMethods(row.identity.authMethods).map(authMethodName).join(", "),
      render: (row) =>
        row.identity.authMethods.length ? (
          <span>{sortedMethods(row.identity.authMethods).map(authMethodName).join(", ")}</span>
        ) : (
          <Muted>None</Muted>
        )
    },
    {
      id: "signIn",
      header: "Sign-in",
      text: (row) => signInOf(row).label,
      render: (row) => {
        const { tone, icon, label } = signInOf(row);
        return (
          <StatusText tone={tone} icon={icon}>
            {label}
          </StatusText>
        );
      }
    },
    {
      id: "lastUsed",
      header: "Last used",
      sortable: true,
      text: (row) => lastUsedLabel(row.lastLoginTime),
      render: (row) =>
        row.lastLoginTime && row.lastLoginAuthMethod ? (
          <Tooltip
            content={`Last login with ${authMethodName(row.lastLoginAuthMethod)}, ${formatDateTime(row.lastLoginTime)}`}
          >
            <span>{lastUsedLabel(row.lastLoginTime)}</span>
          </Tooltip>
        ) : (
          <Muted>{lastUsedLabel(row.lastLoginTime)}</Muted>
        )
    }
  ];

  const rowActions: DataTableRowActions<Row> = {
    renderMenu: (row) =>
      isProjectScoped(row) ? (
        <DropdownMenuItem onSelect={() => openDetail(row)}>
          <Icon name="external" />
          Open in project
        </DropdownMenuItem>
      ) : (
        <>
          <DropdownMenuItem
            disabled={!canEdit}
            description={canEdit ? undefined : RESTRICTED}
            onSelect={() => openDetail(row)}
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
              {sortedMethods(row.identity.authMethods).map((method) => (
                <DropdownMenuItem
                  key={method}
                  onSelect={() => setAuthView({ identity: authIdentityOf(row), method })}
                >
                  {authMethodName(method)}
                  {row.identity.activeLockoutAuthMethods.includes(method) && <Icon name="lock" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                disabled={!canEditAuth}
                description={canEditAuth ? undefined : RESTRICTED}
                onSelect={() => setAuthForm({ identity: authIdentityOf(row) })}
              >
                <Icon name="plus" />
                Add auth method
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!canDelete || row.identity.hasDeleteProtection}
            description={canDelete ? undefined : RESTRICTED}
            onSelect={() => setDeleting(row)}
          >
            <Icon name="trash" />
            {row.identity.hasDeleteProtection
              ? "Delete is blocked by delete protection"
              : "Delete machine identity"}
          </DropdownMenuItem>
        </>
      )
  };

  const scopeLabel = scope === "project" ? "project" : "organization";
  let empty = { title: "No machine identities have been added to this organization" };
  if (searching)
    empty = {
      title:
        scope === "all"
          ? "No machine identities match your search"
          : `No ${scopeLabel} machine identities match your search`
    };
  else if (scope === "project") empty = { title: "No project machine identities found" };
  const allCount =
    counts?.organization === undefined && counts?.project === undefined
      ? undefined
      : (counts?.organization ?? 0) + (counts?.project ?? 0);

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
                setPage(1);
              }}
              tabs={[
                { value: "organization", label: "Org", count: counts?.organization },
                { value: "project", label: "Project", count: counts?.project },
                { value: "all", label: "All", count: allCount }
              ]}
            />
          </div>
          <div className={styles.grow}>
            <Input
              icon="search"
              placeholder="Search machine identities by name or role..."
              aria-label="Search machine identities by name or role"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Gate allowed={canCreate}>
            <Button
              variant="accent"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setCreating(true)}
            >
              Create
            </Button>
          </Gate>
        </div>
        <DataTable
          label="Organization machine identities"
          rows={rows}
          columns={columns}
          rowActions={rowActions}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.identity.name}
          loading={isPending}
          loadingRows={perPage}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          empty={
            <EmptyState
              size="sm"
              icon={searching ? "search" : "machine"}
              title={empty.title}
              actions={
                searching ? (
                  <Button variant="link" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          }
          pagination={
            !isPending && totalCount > 0 ? (
              <Pagination
                label="Machine identity pages"
                variant="compact"
                page={page}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                }}
              />
            ) : undefined
          }
        />
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
            <AlertDialogTitle>{`Delete ${deleting?.identity.name ?? "machine identity"}?`}</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                setDeleting(undefined);
                try {
                  await deleteIdentity.mutateAsync({ identityId: deleting.identity.id, orgId });
                  saved("Successfully deleted machine identity");
                } catch (error) {
                  failed("Failed to delete machine identity", error);
                }
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
