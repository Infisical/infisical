import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import type { TAgentVaultAccessBundleListItem } from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AccessBundleDialog, DeleteAccessBundleDialog } from "../resources/access-bundle-dialogs";
import {
  AgentVaultDocs,
  nameList,
  plural,
  useIsAgentVaultAdmin
} from "../resources/agent-vault-utils";
import { ManageAccessSheet } from "../resources/manage-access-sheet";
import { DateCell, ServiceIconStack } from "../resources/shared";

import css from "../resources/resources.module.css";

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/");
const detailRoute = v4Path(
  "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
);
const servicesRoute = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/services");
const TABLE = "agentVaultAccessBundlesTable";
const SORTABLE = ["name", "serviceCount", "createdAt"] as const;
type TSortColumn = (typeof SORTABLE)[number];
const DEFAULT_SORT = {
  columnId: "createdAt" as TSortColumn,
  direction: "desc" as const
};

const AccessBundles = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const resources = useV4Adapter("agentVaultResources");
  const navigate = useNavigate();
  const { isAdmin, isPending: isRolePending } = useIsAgentVaultAdmin(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [sort, setSort] = useState<{
    columnId: TSortColumn;
    direction: "asc" | "desc";
  }>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TAgentVaultAccessBundleListItem>();
  const [deleting, setDeleting] = useState<TAgentVaultAccessBundleListItem>();
  const [managing, setManaging] = useState<TAgentVaultAccessBundleListItem>();
  useAgentVaultCreateIntent(() => setCreating(true), isAdmin);

  const { data, isPending } = resources.useAccessBundles(projectId, {
    search: debouncedSearch.trim() || undefined,
    orderBy: sort.columnId,
    orderDirection: sort.direction,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: requiringSetup } = resources.useAccessBundles(projectId, {
    requiresSetup: true,
    limit: 100
  });
  const bundles = data?.accessBundles ?? [];
  const totalCount = data?.totalCount ?? 0;
  const needingSetup = requiringSetup?.accessBundles ?? [];
  const needingSetupCount = requiringSetup?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  const isFiltered = Boolean(debouncedSearch.trim());
  const openDetail = (bundle: { id: string }) =>
    navigate({
      to: detailRoute,
      params: { orgId, projectId, accessBundleId: bundle.id }
    });

  const columns: DataTableColumn<TAgentVaultAccessBundleListItem>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      minWidth: 240,
      text: (bundle) => bundle.name,
      render: (bundle) => (
        <Inline gap={8} align="center" wrap={false}>
          <span className={css.linkWrap}>
            <RowLink
              link={{
                to: detailRoute,
                params: { orgId, projectId, accessBundleId: bundle.id }
              }}
              title={bundle.name}
            >
              {bundle.name}
            </RowLink>
          </span>
          {bundle.description && (
            <Meta mono={false} title={bundle.description} className={css.description}>
              {bundle.description}
            </Meta>
          )}
        </Inline>
      )
    },
    {
      id: "serviceCount",
      header: "Services",
      sortable: true,
      width: 176,
      render: (bundle) => (
        <ServiceIconStack
          hostPatterns={bundle.hostPatterns}
          nativeServices={bundle.nativeServices}
        />
      )
    },
    {
      id: "members",
      header: "Members",
      width: 128,
      render: (bundle) =>
        isAdmin ? (
          <Button
            variant="link"
            underline="always"
            onClick={(event) => {
              event.stopPropagation();
              setManaging(bundle);
            }}
          >
            {plural(bundle.memberCount, "member")}
          </Button>
        ) : (
          <span>{plural(bundle.memberCount, "member")}</span>
        )
    },
    {
      id: "createdAt",
      header: "Created",
      sortable: true,
      width: 128,
      render: (bundle) => <DateCell value={bundle.createdAt} />
    },
    {
      id: "setup",
      header: "Setup",
      hideHeader: true,
      width: 144,
      render: (bundle) =>
        bundle.servicesRequiringSetup.length > 0 ? (
          <Tooltip
            content={`Your personal values are missing for ${nameList(bundle.servicesRequiringSetup.map((service) => service.name))}.`}
          >
            <Badge tone="warn" icon="alert" tabIndex={0}>
              Requires setup
            </Badge>
          </Tooltip>
        ) : null
    }
  ];

  const rowActions: DataTableRowActions<TAgentVaultAccessBundleListItem> | undefined = isAdmin
    ? {
        menuLabel: "Access bundle options",
        inline: [
          {
            label: "Edit access bundle",
            icon: PencilIcon,
            onSelect: setEditing
          }
        ],
        renderMenu: (bundle) => (
          <>
            <DropdownMenuItem onSelect={() => setManaging(bundle)}>
              <Icon name="users" />
              Manage access
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(bundle)}>
              <Icon name="trash" />
              Delete access bundle
            </DropdownMenuItem>
          </>
        )
      }
    : undefined;

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="folder"
      title="No access bundles available"
      description="Ask an admin to grant you an access bundle."
    />
  );
  if (isFiltered)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No access bundles match your search"
        actions={
          <Button variant="outline" onClick={() => setSearch("")}>
            Clear search
          </Button>
        }
      />
    );
  else if (isAdmin)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="folder"
        title="No access bundles yet"
        description="A bundle groups the services an agent can reach in one session."
        actions={
          <Button variant="outline" icon="plus" onClick={() => setCreating(true)}>
            Create access bundle
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <PageTitle title="Access Bundles" />
      <Stack gap={24}>
        <PageHeader
          title="Access bundles"
          badges={
            <DocumentationLink href={AgentVaultDocs.accessBundles} subject="access bundles" />
          }
          actions={
            isAdmin ? (
              <Button variant="accent" icon="plus" onClick={() => setCreating(true)}>
                Create access bundle
              </Button>
            ) : undefined
          }
        />
        {needingSetup.length > 0 && (
          <Alert
            tone="warn"
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: servicesRoute,
                    params: { orgId, projectId },
                    search: { requiresSetup: true }
                  })
                }
              >
                Set up on services
              </Button>
            }
          >
            {`${
              needingSetupCount === 1
                ? `${needingSetup[0].name} has services that require your personal values.`
                : `${needingSetupCount} access bundles have services that require your personal values.`
            } Sessions can't reach those services until you set them up.`}
          </Alert>
        )}
        <Input
          icon="search"
          aria-label="Search access bundles"
          placeholder="Search access bundles..."
          kbd="/"
          maxLength={255}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <DataTable
          label="Access bundles"
          rows={bundles}
          columns={columns}
          loading={isPending || isRolePending}
          getRowId={(bundle) => bundle.id}
          rowLabel={(bundle) => bundle.name}
          rowActions={rowActions}
          sort={sort}
          onSortChange={(next) => {
            setSort(
              SORTABLE.includes(next.columnId as TSortColumn)
                ? {
                    columnId: next.columnId as TSortColumn,
                    direction: next.direction
                  }
                : DEFAULT_SORT
            );
            setPage(1);
          }}
          empty={empty}
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Access bundle pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      {creating && (
        <AccessBundleDialog
          projectId={projectId}
          onOpenChange={setCreating}
          onCreated={openDetail}
        />
      )}
      {editing && (
        <AccessBundleDialog
          key={editing.id}
          projectId={projectId}
          accessBundle={editing}
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      )}
      <DeleteAccessBundleDialog
        projectId={projectId}
        accessBundle={deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      />
      <ManageAccessSheet
        projectId={projectId}
        accessBundle={managing}
        onOpenChange={(open) => !open && setManaging(undefined)}
      />
    </TooltipProvider>
  );
};

export const AgentVaultAccessBundlesPage = () => {
  const { orgId, projectId } = useParams({ from: route });
  return <AccessBundles key={projectId} orgId={orgId} projectId={projectId} />;
};
