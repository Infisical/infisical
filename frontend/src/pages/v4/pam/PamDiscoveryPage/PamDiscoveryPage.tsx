import { useMemo, useState } from "react";
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
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Meta } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import type { TPamDiscoverySource } from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { AddSourceSheet } from "./add-source-sheet";
import { SCHEDULE_LABELS } from "./source-form";
import { SourceSheet } from "./source-sheet";
import { DiscoveryStatus } from "./status";

const DeleteSourceDialog = ({
  source,
  onClose
}: {
  source?: TPamDiscoverySource;
  onClose: () => void;
}) => {
  const deleteSource = useV4Adapter("pam").useDeleteDiscoverySource();
  const [deleting, setDeleting] = useState(false);
  return (
    <AlertDialog open={Boolean(source)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="sm" tone="danger" confirmText={source?.name} pending={deleting}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete "${source?.name}"`}</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the source and its scan history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={deleting}
            onClick={async () => {
              if (!source) return;
              setDeleting(true);
              try {
                await deleteSource.mutateAsync({
                  discoveryType: source.discoveryType,
                  sourceId: source.id
                });
                saved(`Discovery source "${source.name}" deleted`);
                onClose();
              } catch (error) {
                failed("Could not delete the discovery source", error);
              } finally {
                setDeleting(false);
              }
            }}
          >
            Delete source
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PamDiscoveryPage = () => {
  const pam = useV4Adapter("pam");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<TPamDiscoverySource>();
  const sheet = usePamSheetState("discoverySourceId");
  const triggerScan = pam.useTriggerDiscoveryScan();

  const { data: sources = [], isPending } = pam.useDiscoverySources({
    search: debouncedSearch.trim() || undefined
  });
  const { data: types = [] } = pam.useDiscoveryTypes();
  const typeMap = useMemo(() => new Map(types.map((entry) => [entry.type, entry])), [types]);
  const query = search.trim().toLowerCase();
  const rows = query
    ? sources.filter((source) => source.name.toLowerCase().includes(query))
    : sources;

  const scan = async (source: TPamDiscoverySource) => {
    try {
      await triggerScan.mutateAsync({ discoveryType: source.discoveryType, sourceId: source.id });
      saved(`Scan of "${source.name}" started`);
    } catch (error) {
      failed("Could not start the scan", error);
    }
  };

  const columns: DataTableColumn<TPamDiscoverySource>[] = [
    {
      id: "name",
      header: "Source",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => {
        const meta = typeMap.get(row.discoveryType);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt="" size="sm" />}
            <Button
              variant="link"
              underline="hover"
              title={row.name}
              onClick={() => sheet.openSheet(row.id)}
            >
              {row.name}
            </Button>
          </Inline>
        );
      },
      secondary: (row) => typeMap.get(row.discoveryType)?.name ?? row.discoveryType
    },
    {
      id: "status",
      header: "Status",
      width: 152,
      render: (row) => <DiscoveryStatus status={row.lastRunStatus} error={row.lastRunError} />
    },
    {
      id: "schedule",
      header: "Schedule",
      width: 120,
      text: (row) => SCHEDULE_LABELS[row.schedule],
      render: (row) => SCHEDULE_LABELS[row.schedule]
    },
    {
      id: "lastRun",
      header: "Last run",
      width: 192,
      render: (row) => (
        <Meta mono={false}>
          {row.lastRunAt ? format(new Date(row.lastRunAt), "MMM d, yyyy h:mm a") : "Never"}
        </Meta>
      )
    }
  ];

  return (
    <TooltipProvider>
      <PageTitle title="Discovery" />
      <Stack gap={24}>
        <PageHeader
          title="Discovery"
          badges={
            <DocumentationLink
              href="https://infisical.com/docs/documentation/platform/pam/discovery/overview"
              subject="discovery"
            />
          }
          actions={
            <Button variant="accent" icon="plus" onClick={() => setAdding(true)}>
              Add source
            </Button>
          }
        />
        <FilterBar
          label="Discovery source filters"
          search={
            <Input
              icon="search"
              aria-label="Search discovery sources"
              placeholder="Search by name..."
              kbd="/"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          }
        />
        <DataTable
          label="Discovery sources"
          rows={rows}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          // v4-check-ignore row-activate-navigates -- opens the source sheet in place; the search param only keeps it addressable
          onRowActivate={(row) => sheet.openSheet(row.id)}
          rowActions={{
            menuLabel: "Source options",
            renderMenu: (row) => (
              <>
                <DropdownMenuItem onSelect={() => sheet.openSheet(row.id, PamSheetTab.General)}>
                  <Icon name="folder-open" />
                  Staged accounts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => sheet.openSheet(row.id, PamSheetTab.Stale)}>
                  <Icon name="alert" />
                  Stale accounts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => sheet.openSheet(row.id, PamSheetTab.Runs)}>
                  <Icon name="history" />
                  Runs
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => sheet.openSheet(row.id, PamSheetTab.Configuration)}
                >
                  <Icon name="settings" />
                  Configuration
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => scan(row)}>
                  <Icon name="radar" />
                  Scan now
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                  <Icon name="trash" />
                  Delete source
                </DropdownMenuItem>
              </>
            )
          }}
          empty={
            query ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No sources match your search"
                actions={
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="radar"
                title="No discovery sources yet"
                actions={
                  <Button variant="outline" icon="plus" onClick={() => setAdding(true)}>
                    Add source
                  </Button>
                }
              />
            )
          }
        />
      </Stack>
      <AddSourceSheet open={adding} onOpenChange={setAdding} />
      <SourceSheet
        sourceId={sheet.selectedId}
        tab={sheet.tab}
        onTabChange={sheet.setTab}
        onClose={sheet.closeSheet}
      />
      <DeleteSourceDialog source={deleting} onClose={() => setDeleting(undefined)} />
    </TooltipProvider>
  );
};
