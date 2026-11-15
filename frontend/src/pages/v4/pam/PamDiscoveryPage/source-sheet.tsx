import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Meta, SmallText } from "@infisical/cipher/ui/text";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamDiscoveryType,
  type TPamAccountTypeMetadata,
  type TPamDiscoveredAccount,
  type TPamDiscoveryRun,
  type TPamDiscoverySource,
  type TPamStaleAccount
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";
import { PamSheetTab } from "@app/hooks/usePamSheetState";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { SourceFields } from "./config-fields";
import { ImportDialog } from "./import-dialog";
import {
  accountLabel,
  SCHEDULE_LABELS,
  sourceFormErrors,
  sourceFormOf,
  sourcePayload,
  type TSourceForm
} from "./source-form";
import { DiscoveryStatus } from "./status";

const formatDate = (value?: string | null) =>
  value ? format(new Date(value), "MMM d, yyyy h:mm a") : undefined;

const TypeCell = ({ type, meta }: { type: string; meta?: TPamAccountTypeMetadata }) => (
  <Inline gap={8} align="center" wrap={false}>
    {meta && <ProviderIcon icon={meta.icon} alt="" size="sm" />}
    <span>{meta?.name ?? type}</span>
  </Inline>
);

const usePaging = (table: string) => {
  const [search, setSearch] = useState("");
  const [debounced] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(table, PreferenceKey.PerPage, 20)
  );
  return {
    search,
    setSearch: (next: string) => {
      setSearch(next);
      setPage(1);
    },
    params: { search: debounced, offset: (page - 1) * perPage, limit: perPage },
    pagination: (total: number, label: string) =>
      total > 0 ? (
        <Pagination
          label={label}
          variant="compact"
          page={page}
          onPageChange={setPage}
          total={total}
          pageSize={perPage}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageSizeChange={(next) => {
            setPerPage(next);
            setPage(1);
            setUserTablePreference(table, PreferenceKey.PerPage, next);
          }}
        />
      ) : undefined
  };
};

const StagedTab = ({
  source,
  typeMap,
  showDependencies
}: {
  source: TPamDiscoverySource;
  typeMap: Map<string, TPamAccountTypeMetadata>;
  showDependencies: boolean;
}) => {
  const paging = usePaging("pamDiscoveredAccountsTable");
  const { data, isPending } = useV4Adapter("pam").useDiscoveredAccounts(source.id, paging.params);
  const [selected, setSelected] = useState<Record<string, TPamDiscoveredAccount>>({});
  const [importing, setImporting] = useState(false);
  const rows = data?.discoveredAccounts ?? [];
  const rowIds = new Set(rows.map((row) => row.id));
  const selectedAccounts = Object.values(selected);

  const columns: DataTableColumn<TPamDiscoveredAccount>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => row.name
    },
    {
      id: "type",
      header: "Type",
      width: 200,
      render: (row) => <TypeCell type={row.accountType} meta={typeMap.get(row.accountType)} />
    },
    ...(showDependencies
      ? [
          {
            id: "dependencies",
            header: "Dependencies",
            width: 128,
            render: (row: TPamDiscoveredAccount) =>
              row.dependencyCount > 0 ? (
                <Badge tone="soft">{row.dependencyCount}</Badge>
              ) : (
                <Meta>-</Meta>
              )
          }
        ]
      : [])
  ];

  return (
    <Stack gap={16}>
      <Input
        icon="search"
        aria-label="Search staged accounts"
        placeholder="Search accounts..."
        value={paging.search}
        onChange={(event) => paging.setSearch(event.target.value)}
      />
      <DataTable
        label="Staged accounts"
        rows={rows}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        selectable
        selectedIds={Object.keys(selected).filter((id) => rowIds.has(id))}
        onSelectionChange={(ids) =>
          setSelected((current) => {
            const next = { ...current };
            const picked = new Set(ids);
            rows.forEach((row) => {
              if (picked.has(row.id)) next[row.id] = row;
              else delete next[row.id];
            });
            return next;
          })
        }
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon={paging.params.search ? "search" : "radar"}
            title={
              paging.params.search
                ? "No accounts match your search"
                : "No staged accounts. Run a scan to discover accounts."
            }
          />
        }
        pagination={paging.pagination(data?.totalCount ?? 0, "Staged account pages")}
        actionBar={
          selectedAccounts.length > 0 ? (
            <FloatingActionBar
              label="Selected account actions"
              count={selectedAccounts.length}
              onClear={() => setSelected({})}
              noun={selectedAccounts.length === 1 ? "account" : "accounts"}
              actions={[
                { label: "Import accounts", icon: "download", onClick: () => setImporting(true) }
              ]}
            />
          ) : undefined
        }
      />
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        sourceId={source.id}
        credentialAccountId={source.credentialAccountId}
        accounts={selectedAccounts}
        onImported={(ids) =>
          setSelected((current) =>
            Object.fromEntries(Object.entries(current).filter(([id]) => !new Set(ids).has(id)))
          )
        }
      />
    </Stack>
  );
};

const StaleTab = ({
  source,
  typeMap
}: {
  source: TPamDiscoverySource;
  typeMap: Map<string, TPamAccountTypeMetadata>;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const paging = usePaging("pamStaleAccountsTable");
  const { data, isPending } = useV4Adapter("pam").useStaleAccounts(source.id, paging.params);

  const columns: DataTableColumn<TPamStaleAccount>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <RowLink
          link={{
            to: v4Path("/organizations/$orgId/$"),
            params: { orgId, _splat: `pam/accounts/${row.accountType}/${row.accountId}/access` }
          }}
        >
          {row.name}
        </RowLink>
      )
    },
    {
      id: "folder",
      header: "Folder",
      width: 176,
      text: (row) => row.folderName ?? "-",
      render: (row) => row.folderName ?? "-"
    },
    {
      id: "type",
      header: "Type",
      width: 200,
      render: (row) => <TypeCell type={row.accountType} meta={typeMap.get(row.accountType)} />
    },
    {
      id: "lastSeen",
      header: "Last seen",
      width: 184,
      render: (row) => <Meta mono={false}>{formatDate(row.lastDiscoveredAt) ?? "-"}</Meta>
    }
  ];

  return (
    <Stack gap={16}>
      <SmallText muted>
        Imported accounts the latest scan no longer found. They keep working, including rotation and
        access, so delete the ones that are really gone.
      </SmallText>
      <Input
        icon="search"
        aria-label="Search stale accounts"
        placeholder="Search accounts..."
        value={paging.search}
        onChange={(event) => paging.setSearch(event.target.value)}
      />
      <DataTable
        label="Stale accounts"
        rows={data?.accounts ?? []}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon={paging.params.search ? "search" : "check-c"}
            title={
              paging.params.search
                ? "No accounts match your search"
                : "No stale accounts. The latest scan found everything imported from this source."
            }
          />
        }
        pagination={paging.pagination(data?.totalCount ?? 0, "Stale account pages")}
      />
    </Stack>
  );
};

const RunResult = ({ run }: { run: TPamDiscoveryRun }) => {
  if (run.status === "failed")
    return <SmallText preWrap>{run.errorMessage ?? "The scan failed"}</SmallText>;
  const machineErrors = run.machineErrors ?? [];
  return (
    <Stack gap={8}>
      <Inline gap={12}>
        <span>{`${run.discoveredCount} ${run.discoveredCount === 1 ? "account" : "accounts"}, ${run.newCount} new`}</span>
        {typeof run.dependencyCount === "number" && (
          <Meta mono={false}>
            {`${run.dependencyCount} ${run.dependencyCount === 1 ? "dependency" : "dependencies"}, ${run.newDependencyCount ?? 0} new`}
          </Meta>
        )}
      </Inline>
      {machineErrors.length > 0 && (
        <Alert tone="warn" title="The scan couldn't complete on some machines">
          <Stack gap={4}>
            {machineErrors.map((entry) => (
              <SmallText key={entry.machine}>{`${entry.machine}: ${entry.error}`}</SmallText>
            ))}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
};

const RunsTab = ({ runs, isPending }: { runs: TPamDiscoveryRun[]; isPending: boolean }) => (
  <DataTable
    label="Scan history"
    rows={runs}
    loading={isPending}
    getRowId={(row) => row.id}
    rowLabel={(row) => formatDate(row.startedAt) ?? row.id}
    columns={[
      {
        id: "started",
        header: "Started",
        width: 184,
        primary: true,
        text: (row) => formatDate(row.startedAt) ?? "-",
        render: (row) => formatDate(row.startedAt) ?? "-"
      },
      {
        id: "status",
        header: "Status",
        width: 128,
        render: (row) => <DiscoveryStatus run status={row.status} />
      },
      {
        id: "result",
        header: "Result",
        grow: true,
        wrap: true,
        render: (row) => <RunResult run={row} />
      }
    ]}
    empty={
      <EmptyState
        size="sm"
        media="bare"
        icon="history"
        title="This source has not been scanned yet"
      />
    }
  />
);

const ConfigurationTab = ({
  source,
  draft,
  onDraft
}: {
  source: TPamDiscoverySource;
  draft?: TSourceForm;
  onDraft: (draft?: TSourceForm) => void;
}) => {
  const updateSource = useV4Adapter("pam").useUpdateDiscoverySource();
  const form = draft ?? sourceFormOf(source);
  const errors = draft ? sourceFormErrors(source.discoveryType, form) : {};
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <SettingsCard
      title="Configuration"
      dirty={Boolean(draft)}
      saveDisabledReason={hasErrors ? "Fix the highlighted fields first" : undefined}
      onDiscard={() => onDraft()}
      onSave={async () => {
        try {
          await updateSource.mutateAsync({
            sourceId: source.id,
            discoveryType: source.discoveryType,
            ...sourcePayload(source.discoveryType, form)
          });
          saved(`Discovery source "${form.name.trim()}" updated`);
          onDraft();
        } catch (error) {
          failed("Could not update the discovery source", error);
          throw error;
        }
      }}
    >
      <SourceFields
        type={source.discoveryType}
        form={form}
        errors={errors}
        onChange={(patch) => onDraft({ ...form, ...patch })}
      />
    </SettingsCard>
  );
};

const SourceBody = ({
  source,
  tab,
  onTabChange,
  draft,
  onDraft
}: {
  source: TPamDiscoverySource;
  tab: PamSheetTab;
  onTabChange: (tab: string) => void;
  draft?: TSourceForm;
  onDraft: (draft?: TSourceForm) => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const pam = useV4Adapter("pam");
  const { data: types = [] } = pam.useDiscoveryTypes();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { data: accounts = [] } = pam.useAccounts();
  const runsQuery = pam.useDiscoveryRuns(source.id, { refetchInterval: 5000 });
  const runs = runsQuery.data ?? [];
  const typeMap = new Map(accountTypes.map((meta) => [meta.type as string, meta]));
  const credential = accounts.find((entry) => entry.id === source.credentialAccountId);
  const showDependencies =
    source.discoveryType !== PamDiscoveryType.Postgres &&
    source.discoveryType !== PamDiscoveryType.MsSQL;

  return (
    <Stack gap={24}>
      <DataList
        variant="meta"
        items={[
          [
            "Type",
            types.find((entry) => entry.type === source.discoveryType)?.name ?? source.discoveryType
          ],
          [
            "Status",
            <DiscoveryStatus key="status" status={runs[0]?.status} error={runs[0]?.errorMessage} />
          ],
          [
            "Credential account",
            credential ? (
              <RowLink
                key="credential"
                link={{
                  to: v4Path("/organizations/$orgId/$"),
                  params: {
                    orgId,
                    _splat: `pam/accounts/${credential.accountType}/${credential.id}/access`
                  }
                }}
              >
                {accountLabel(credential)}
              </RowLink>
            ) : (
              "None"
            )
          ],
          ["Schedule", SCHEDULE_LABELS[source.schedule]],
          ["Last run", formatDate(source.lastRunAt) ?? "Never"]
        ]}
      />
      <Tabs
        label="Discovery source sections"
        value={tab}
        onChange={onTabChange}
        tabs={[
          { value: PamSheetTab.General, label: "Staged accounts" },
          { value: PamSheetTab.Stale, label: "Stale accounts" },
          { value: PamSheetTab.Runs, label: "Runs" },
          { value: PamSheetTab.Configuration, label: "Configuration" }
        ]}
      />
      {tab === PamSheetTab.General && (
        <StagedTab source={source} typeMap={typeMap} showDependencies={showDependencies} />
      )}
      {tab === PamSheetTab.Stale && <StaleTab source={source} typeMap={typeMap} />}
      {tab === PamSheetTab.Runs && <RunsTab runs={runs} isPending={runsQuery.isPending} />}
      {tab === PamSheetTab.Configuration && (
        <ConfigurationTab source={source} draft={draft} onDraft={onDraft} />
      )}
    </Stack>
  );
};

const SOURCE_TABS = [
  PamSheetTab.General,
  PamSheetTab.Stale,
  PamSheetTab.Runs,
  PamSheetTab.Configuration
];

export const SourceSheet = ({
  sourceId,
  tab,
  onTabChange,
  onClose
}: {
  sourceId?: string;
  tab?: PamSheetTab;
  onTabChange: (tab: string) => void;
  onClose: () => void;
}) => {
  const pam = useV4Adapter("pam");
  const { data: sources } = pam.useDiscoverySources();
  const triggerScan = pam.useTriggerDiscoveryScan();
  const [draft, setDraft] = useState<TSourceForm>();
  const [scanning, setScanning] = useState(false);
  const source = sources?.find((entry) => entry.id === sourceId);
  const close = () => {
    setDraft(undefined);
    onClose();
  };
  const guard = useDiscardChangesGuard({ isDirty: Boolean(draft), onDiscard: close });
  const activeTab = tab && SOURCE_TABS.includes(tab) ? tab : PamSheetTab.General;

  const scan = async () => {
    if (!source) return;
    setScanning(true);
    try {
      await triggerScan.mutateAsync({ discoveryType: source.discoveryType, sourceId: source.id });
      saved("Scan started");
      onTabChange(PamSheetTab.Runs);
    } catch (error) {
      failed("Could not start the scan", error);
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <Sheet open={Boolean(sourceId)} onOpenChange={(open) => !open && guard.requestDiscard()}>
        <SheetContent size="lg">
          <SheetHeader>
            <SheetTitle>{source?.name ?? "Discovery source"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {source ? (
              <SourceBody
                source={source}
                tab={activeTab}
                onTabChange={onTabChange}
                draft={draft}
                onDraft={setDraft}
              />
            ) : (
              <Stack gap={16}>
                <Skeleton height={32} width={240} />
                <Skeleton lines={6} />
              </Stack>
            )}
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={guard.requestDiscard}>
              Close
            </Button>
            <Button
              variant="accent"
              icon="radar"
              loading={scanning}
              disabledReason={source ? undefined : "Loading the source"}
              onClick={scan}
            >
              Scan now
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this discovery source will be lost."
      />
    </>
  );
};
