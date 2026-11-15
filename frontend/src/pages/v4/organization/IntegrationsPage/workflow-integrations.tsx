import { useMemo, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";

import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  type WorkflowIntegration,
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED, type Sort } from "../../access/ui";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { PLATFORM_ICONS, PLATFORM_NAMES, PLATFORMS } from "./workflow-platforms";
import { WorkflowSheet, type WorkflowSheetState } from "./workflow-sheet";

const Status = ({ status }: { status: WorkflowIntegrationStatus }) =>
  status === WorkflowIntegrationStatus.Installed ? (
    <Badge tone="ok" dot>
      Installed
    </Badge>
  ) : (
    <Badge tone="warn" dot>
      Pending
    </Badge>
  );

const AddMenu = ({
  canCreate,
  onAdd
}: {
  canCreate: boolean;
  onAdd: (platform: WorkflowIntegrationPlatform) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="accent" icon="plus" disabledReason={canCreate ? undefined : RESTRICTED}>
        Add integration
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {PLATFORMS.map((platform) => (
        <DropdownMenuItem key={platform} onSelect={() => onAdd(platform)}>
          <ProviderIcon icon={PLATFORM_ICONS[platform]} alt="" size="sm" />
          {PLATFORM_NAMES[platform]}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export const WorkflowIntegrationsTab = () => {
  const orgId = useOrgId();
  const integrations = useV4Adapter("integrations");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: rows = [], isPending } = integrations.useWorkflowIntegrations(orgId);
  const deleteSlack = integrations.useDeleteSlackIntegration();
  const deleteTeams = integrations.useDeleteMicrosoftTeamsIntegration();
  const checkTeams = integrations.useCheckMicrosoftTeamsInstallation();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "slug", direction: "asc" });
  const [sheet, setSheet] = useState<WorkflowSheetState>();
  const [deleting, setDeleting] = useState<WorkflowIntegration>();
  const [deletePending, setDeletePending] = useState(false);
  const [busyId, setBusyId] = useState<string>();

  const platformFilter = filters.find((filter) => filter.field === "platform")?.values ?? [];
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const platforms = new Set(filters.find((filter) => filter.field === "platform")?.values);
    const key = (row: WorkflowIntegration) =>
      ({
        platform: PLATFORM_NAMES[row.integration],
        status: row.status
      })[sort.columnId] ?? row.slug;
    return rows
      .filter((row) => !platforms.size || platforms.has(row.integration))
      .filter((row) =>
        [row.slug, row.description ?? "", PLATFORM_NAMES[row.integration]].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .sort(
        (a, b) =>
          key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1) ||
          a.slug.localeCompare(b.slug)
      );
  }, [rows, query, filters, sort]);

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  if (!permissionPending && !canRead)
    return <AccessRestricted requirement="read organization settings" />;

  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const canDelete = permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);
  const add = (platform: WorkflowIntegrationPlatform) => setSheet({ mode: "add", platform });
  const edit = (row: WorkflowIntegration) =>
    setSheet({ mode: "edit", platform: row.integration, id: row.id });

  const reinstall = async (row: WorkflowIntegration) => {
    setBusyId(row.id);
    try {
      const url = await integrations.fetchSlackReinstallUrl({ id: row.id });
      if (url) window.location.assign(url);
      else saved(`Slack integration ${row.slug} reinstalled`);
    } catch (error) {
      failed("Failed to reinstall Slack", error);
    } finally {
      setBusyId(undefined);
    }
  };

  const checkInstallation = async (row: WorkflowIntegration) => {
    setBusyId(row.id);
    try {
      await checkTeams.mutateAsync({ workflowIntegrationId: row.id, orgId });
      saved("The Infisical bot is installed in your Microsoft Teams tenant");
    } catch (error) {
      failed("Failed to check the Microsoft Teams installation", error);
    } finally {
      setBusyId(undefined);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      const remove =
        deleting.integration === WorkflowIntegrationPlatform.SLACK ? deleteSlack : deleteTeams;
      await remove.mutateAsync({ id: deleting.id, orgId });
      saved(`Integration ${deleting.slug} deleted`);
      setDeleting(undefined);
    } catch (error) {
      failed("Failed to delete integration", error);
    } finally {
      setDeletePending(false);
    }
  };

  const columns: DataTableColumn<WorkflowIntegration>[] = [
    {
      id: "slug",
      header: "Alias",
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => (row.description ? `${row.slug}: ${row.description}` : row.slug),
      render: (row) => (
        <Stack gap={2}>
          <Button variant="link" underline="hover" onClick={() => edit(row)}>
            {row.slug}
          </Button>
          {row.description && <Meta mono={false}>{row.description}</Meta>}
        </Stack>
      )
    },
    {
      id: "platform",
      header: "Provider",
      sortable: true,
      width: 200,
      text: (row) => PLATFORM_NAMES[row.integration],
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <ProviderIcon icon={PLATFORM_ICONS[row.integration]} alt="" size="sm" />
          {PLATFORM_NAMES[row.integration]}
        </Inline>
      )
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: 140,
      text: (row) => row.status,
      render: (row) => <Status status={row.status} />
    }
  ];

  const isFiltered = Boolean(query.trim()) || platformFilter.length > 0;

  return (
    <Stack gap={16}>
      <FilterBar
        label="Workflow integration filters"
        fields={[
          {
            key: "platform",
            label: "Provider",
            type: "multi-select",
            options: PLATFORMS.map((platform) => ({
              value: platform,
              label: PLATFORM_NAMES[platform]
            }))
          }
        ]}
        value={filters}
        onChange={setFilters}
        search={
          <Input
            icon="search"
            aria-label="Search workflow integrations"
            placeholder="Search by alias, description or provider"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        }
        actions={<AddMenu canCreate={canCreate} onAdd={add} />}
      />
      <DataTable
        label="Workflow integrations"
        rows={visible}
        loading={isPending || permissionPending}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.slug}
        sort={sort}
        onSortChange={setSort}
        rowActions={{
          menuDisabledReason: (row) => (busyId === row.id ? "Working on it" : undefined),
          renderMenu: (row) => (
            <>
              <DropdownMenuItem onSelect={() => edit(row)}>Edit details</DropdownMenuItem>
              {row.integration === WorkflowIntegrationPlatform.SLACK && (
                <DropdownMenuItem
                  disabledReason={canCreate ? undefined : RESTRICTED}
                  onSelect={() => reinstall(row)}
                >
                  Reinstall
                </DropdownMenuItem>
              )}
              {row.integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
                <DropdownMenuItem
                  disabledReason={canEdit ? undefined : RESTRICTED}
                  onSelect={() => checkInstallation(row)}
                >
                  Check installation status
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabledReason={canDelete ? undefined : RESTRICTED}
                onSelect={() => setDeleting(row)}
              >
                Delete integration
              </DropdownMenuItem>
            </>
          )
        }}
        empty={
          isFiltered ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No integrations match your search"
              actions={
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilters([]);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="bell"
              title="No workflow integrations yet"
              description="Send access requests and approval notifications to Slack or Microsoft Teams."
              actions={
                <>
                  {PLATFORMS.map((platform, index) => (
                    <Button
                      key={platform}
                      variant={index === 0 ? "primary" : "outline"}
                      icon="plus"
                      disabledReason={canCreate ? undefined : RESTRICTED}
                      onClick={() => add(platform)}
                    >
                      Add {PLATFORM_NAMES[platform]}
                    </Button>
                  ))}
                </>
              }
            />
          )
        }
        persistentStatus={`${visible.length} of ${rows.length} integrations`}
      />
      <WorkflowSheet state={sheet} canEdit={canEdit} onClose={() => setSheet(undefined)} />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={deleting?.slug} pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete integration {deleting?.slug}?</AlertDialogTitle>
            <AlertDialogDescription>
              Projects using this integration will stop sending notifications to it. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={deletePending}
              onClick={confirmDelete}
            >
              Delete integration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
