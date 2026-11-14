import { useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { OrgMembershipRole } from "@app/helpers/roles";
import type { OrganizationWithProjects } from "@app/hooks/api/admin/types";
import { OrgMembershipStatus } from "@app/hooks/api/organization/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { saved } from "../../access/toast";
import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useGo, v4Path } from "../../links";
import { AddOrganizationDialog } from "./AddOrganizationDialog";
import { OrganizationMembersSheet } from "./OrganizationMembersSheet";
import { ConfirmDialog, Muted, pagination, plural, usePageReset, usePaging } from "./shared";

const hasAcceptedAdmin = (organization: OrganizationWithProjects) =>
  organization.members.some(
    (member) =>
      member.role === OrgMembershipRole.Admin && member.status === OrgMembershipStatus.Accepted
  );

export const OrganizationsTab = () => {
  const admin = useV4Adapter("admin");
  const session = useV4Session();
  const live = useV4Mode() === "live";
  const go = useGo();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const paging = usePaging("ResourceOverviewOrgsTable", 10);
  const { data, isPending, error } = admin.useOrganizations({
    limit: paging.perPage,
    offset: paging.offset,
    searchTerm: debouncedSearch
  });
  const organizations = data?.organizations ?? [];
  const totalCount = data?.totalCount ?? 0;
  usePageReset(paging, totalCount);
  const accessOrganization = admin.useAccessOrganization();
  const deleteOrganization = admin.useDeleteOrganization();
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string>();
  const [deleting, setDeleting] = useState<OrganizationWithProjects>();

  if (error) throw error;

  const isMember = (organization: OrganizationWithProjects) =>
    organization.members.some((member) => member.user.id === session.user.id);

  const join = async (organization: OrganizationWithProjects) => {
    try {
      await accessOrganization.mutateAsync(organization.id);
    } catch {
      return;
    }
    if (live) go(`${v4Path("/login/select-organization")}?org_id=${organization.id}`);
    saved("Successfully joined organization");
  };

  const columns: DataTableColumn<OrganizationWithProjects>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (organization) => organization.name,
      render: (organization) => (
        <Button
          variant="link"
          underline="hover"
          title={organization.name || undefined}
          onClick={() => setViewingId(organization.id)}
        >
          {organization.name || <Muted>Not set</Muted>}
        </Button>
      )
    },
    {
      id: "members",
      header: "Members",
      width: 200,
      render: (organization) => (
        <Inline gap={8} align="center" wrap={false}>
          <span>{plural(organization.members.length, "member")}</span>
          {!hasAcceptedAdmin(organization) && (
            <Tooltip content="No admins have accepted their invitations.">
              <span role="img" aria-label="No admins have accepted their invitations">
                <Icon name="alert" size={14} />
              </span>
            </Tooltip>
          )}
        </Inline>
      )
    },
    {
      id: "projects",
      header: "Projects",
      width: 200,
      render: (organization) => plural(organization.projects.length, "project")
    }
  ];

  const rowActions: DataTableRowActions<OrganizationWithProjects> = {
    menuLabel: "Organization options",
    inline: [
      {
        label: "Join organization",
        icon: "user-plus",
        disabledReason: (organization) =>
          isMember(organization) ? "You are a member of this organization" : undefined,
        onSelect: join
      }
    ],
    renderMenu: (organization) => (
      <>
        <DropdownMenuItem onSelect={() => setViewingId(organization.id)}>
          <Icon name="user" />
          View members
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(organization)}>
          <Icon name="trash" />
          Delete organization
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label="Organization filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search organizations"
            placeholder="Search organizations..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              paging.setPage(1);
            }}
          />
        }
        actions={
          <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>
            Add organization
          </Button>
        }
      />
      <DataTable
        label="Organizations"
        rows={organizations}
        columns={columns}
        loading={isPending}
        loadingRows={paging.perPage > 10 ? 10 : paging.perPage}
        getRowId={(organization) => organization.id}
        rowLabel={(organization) => organization.name}
        rowActions={rowActions}
        onRowActivate={(organization) => setViewingId(organization.id)}
        empty={
          debouncedSearch ? (
            <EmptyState size="sm" icon="search" title="No organizations match search" />
          ) : (
            <EmptyState size="sm" icon="building" title="No organizations found" />
          )
        }
        pagination={pagination(paging, totalCount, "Organization pages")}
      />
      <AddOrganizationDialog open={creating} onOpenChange={setCreating} />
      <OrganizationMembersSheet
        organization={organizations.find((organization) => organization.id === viewingId)}
        onOpenChange={(open) => !open && setViewingId(undefined)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete organization ${deleting?.name ?? ""}?`}
        confirmText="delete"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteOrganization.mutateAsync(deleting.id);
          saved("Successfully deleted organization");
        }}
      />
    </Stack>
  );
};
