import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Play, Radar, Search, TriangleAlert } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Checkbox } from "@app/components/v3/generic/Checkbox";
import { useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamAccountType,
  PamDiscoverySchedule,
  pamKeys,
  TPamDiscoveredAccount,
  TPamDiscoverySource,
  useListPamAccountsAdmin,
  useListPamDiscoveredAccounts,
  useListPamDiscoveryRuns,
  useListPamDiscoverySources,
  useListPamDiscoveryTypes,
  usePamAccountTypeMap,
  useTriggerPamDiscoveryScan,
  useUpdatePamDiscoverySource
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";

import { PamDetailSheet, PamDetailSheetTab } from "../../components/PamDetailSheet";
import { PAM_DISCOVERY_TABS } from "../../components/pamResourceTabs";
import { SheetSaveBar } from "../../components/SheetSaveBar";
import {
  buildDiscoveryConfiguration,
  CredentialAccountField,
  DiscoveryConfigFields,
  discoveryConfigFormShape,
  discoveryConfigFromSource,
  ScheduleField,
  TDiscoveryConfigFields
} from "./DiscoveryConfigFields";
import { DiscoveryStatusBadge } from "./DiscoveryStatusBadge";
import { ImportDiscoveredModal } from "./ImportDiscoveredModal";

const STATUS_VARIANT: Record<string, "info" | "success" | "danger" | "neutral"> = {
  running: "info",
  completed: "success",
  failed: "danger"
};

const RunStatusBadge = ({ status }: { status: string }) => (
  <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</Badge>
);

const configSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  credentialAccountId: z.string().uuid("Select a credential account"),
  schedule: z.nativeEnum(PamDiscoverySchedule),
  gatewayId: z.string().nullable(),
  gatewayPoolId: z.string().nullable(),
  ...discoveryConfigFormShape
});

type ConfigForm = z.infer<typeof configSchema>;

const ConfigurationTab = ({
  source,
  onDirtyChange
}: {
  source: TPamDiscoverySource;
  onDirtyChange: (isDirty: boolean) => void;
}) => {
  const updateSource = useUpdatePamDiscoverySource();

  const defaults: ConfigForm = {
    name: source.name,
    credentialAccountId: source.credentialAccountId,
    schedule: source.schedule,
    gatewayId: source.gatewayId ?? null,
    gatewayPoolId: source.gatewayPoolId ?? null,
    ...discoveryConfigFromSource(source.discoveryConfiguration)
  };

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty }
  } = useForm<ConfigForm>({ resolver: zodResolver(configSchema), defaultValues: defaults });

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, reset]);

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const onSubmit = (data: ConfigForm) => {
    updateSource.mutate(
      {
        sourceId: source.id,
        discoveryType: source.discoveryType,
        name: data.name,
        credentialAccountId: data.credentialAccountId,
        schedule: data.schedule,
        gatewayId: data.gatewayId,
        gatewayPoolId: data.gatewayPoolId,
        configuration: buildDiscoveryConfiguration(data)
      },
      { onSuccess: () => createNotification({ type: "success", text: "Discovery source updated" }) }
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            Edit the source name, credential account, gateway, schedule, and local-account
            discovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <FieldContent>
                  <Input {...field} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <CredentialAccountField
            control={control as unknown as Control<{ credentialAccountId: string }>}
          />

          <Field>
            <FieldLabel>Gateway</FieldLabel>
            <FieldContent>
              <GatewayPicker
                isRequired
                value={{ gatewayId, gatewayPoolId }}
                onChange={(value) => {
                  setValue("gatewayId", value.gatewayId, { shouldDirty: true });
                  setValue("gatewayPoolId", value.gatewayPoolId, { shouldDirty: true });
                }}
              />
            </FieldContent>
          </Field>

          <ScheduleField
            control={control as unknown as Control<{ schedule: PamDiscoverySchedule }>}
          />

          <DiscoveryConfigFields control={control as unknown as Control<TDiscoveryConfigFields>} />
        </CardContent>
      </Card>

      <div aria-hidden className="h-8 shrink-0" />
      {isDirty && <SheetSaveBar isPending={updateSource.isPending} onDiscard={() => reset()} />}
    </form>
  );
};

type Props = {
  isOpen: boolean;
  sourceId?: string;
  onOpenChange: (open: boolean) => void;
};

export const DiscoverySourceDetailSheet = ({ isOpen, sourceId, onOpenChange }: Props) => {
  const [selected, setSelected] = useState<Record<string, TPamDiscoveredAccount>>({});
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("pamDiscoveredAccountsTable", PreferenceKey.PerPage, 20)
  );

  const { currentOrg } = useOrganization();
  const { tab, setTab } = usePamSheetState("discoverySourceId");
  const { data: sources = [] } = useListPamDiscoverySources();
  const { data: discoveryTypes = [] } = useListPamDiscoveryTypes();
  const { data: adminAccounts = [] } = useListPamAccountsAdmin();
  const { map: accountTypeMap } = usePamAccountTypeMap();
  const source = sources.find((s) => s.id === sourceId);
  const typeMeta = discoveryTypes.find((t) => t.type === source?.discoveryType);
  const credentialAccount = adminAccounts.find((a) => a.id === source?.credentialAccountId);
  const credentialAccountLabel = (() => {
    if (!credentialAccount) return "View account";
    return credentialAccount.folderName
      ? `${credentialAccount.folderName} / ${credentialAccount.name}`
      : credentialAccount.name;
  })();

  const { data: runs = [] } = useListPamDiscoveryRuns(sourceId ?? "", {
    refetchInterval: isOpen ? 5000 : undefined
  });
  const offset = (page - 1) * perPage;
  const { data: { discoveredAccounts: staged = [], totalCount = 0 } = {} } =
    useListPamDiscoveredAccounts(sourceId ?? "", {
      search: debouncedSearch,
      offset,
      limit: perPage
    });
  const triggerScan = useTriggerPamDiscoveryScan();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const queryClient = useQueryClient();
  const latestRunStatus = runs[0]?.status;
  const prevRunStatus = useRef(latestRunStatus);
  useEffect(() => {
    if (prevRunStatus.current === "running" && latestRunStatus && latestRunStatus !== "running") {
      queryClient.invalidateQueries({
        queryKey: [...pamKeys.discovery(), "discovered", sourceId ?? ""]
      });
    }
    prevRunStatus.current = latestRunStatus;
  }, [latestRunStatus, sourceId, queryClient]);

  const handleScan = () => {
    if (!source) return;
    triggerScan.mutate(
      { discoveryType: source.discoveryType, sourceId: source.id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Scan started" });
          setTab(PamSheetTab.Runs);
        }
      }
    );
  };

  const q = search.trim().toLowerCase();
  const visibleStaged = q ? staged.filter((a) => a.name.toLowerCase().includes(q)) : staged;

  const selectedAccounts = Object.values(selected);
  const allPageSelected =
    visibleStaged.length > 0 && visibleStaged.every((a) => Boolean(selected[a.id]));
  const toggle = (account: TPamDiscoveredAccount) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[account.id]) {
        delete next[account.id];
      } else {
        next[account.id] = account;
      }
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      if (allPageSelected) {
        const next = { ...prev };
        visibleStaged.forEach((a) => delete next[a.id]);
        return next;
      }
      const next = { ...prev };
      visibleStaged.forEach((a) => {
        next[a.id] = a;
      });
      return next;
    });

  const stagedTab: ReactNode = (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Staged Accounts</CardTitle>
          <CardDescription>
            Accounts found by the last scan. Select accounts to import them into a folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>

          {totalCount === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {debouncedSearch
                    ? "No accounts match your search."
                    : "No staged accounts. Run a scan to discover accounts."}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        id="select-all-discovered"
                        isChecked={allPageSelected}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-40">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStaged.map((account) => {
                    const typeDetails = accountTypeMap[account.accountType as PamAccountType];
                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Checkbox
                            id={`discovered-${account.id}`}
                            isChecked={Boolean(selected[account.id])}
                            onCheckedChange={() => toggle(account)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          <HighlightText text={account.name} highlight={search} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {typeDetails && (
                              <img
                                src={`/images/integrations/${typeDetails.icon}`}
                                alt={typeDetails.name}
                                className="size-5 shrink-0 rounded-sm"
                              />
                            )}
                            <span className="text-sm">
                              {typeDetails?.name ?? account.accountType}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Pagination
                count={totalCount}
                page={page}
                perPage={perPage}
                onChangePage={setPage}
                onChangePerPage={(newPerPage) => {
                  setPerPage(newPerPage);
                  setPage(1);
                  setUserTablePreference(
                    "pamDiscoveredAccountsTable",
                    PreferenceKey.PerPage,
                    newPerPage
                  );
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {selectedAccounts.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-auto -mb-4 flex items-center gap-2 border-t border-border bg-popover px-4 py-3">
          <span className="mr-auto text-sm text-muted">{selectedAccounts.length} selected</span>
          <Button type="button" variant="ghost" onClick={() => setSelected({})}>
            Clear
          </Button>
          <Button type="button" variant="pam" onClick={() => setIsImportOpen(true)}>
            Import Accounts
          </Button>
        </div>
      )}
    </div>
  );

  const runsTab: ReactNode = (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Scan History</CardTitle>
          <CardDescription>The result of each scan run for this source.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>This source has not been scanned yet.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const machineErrors = run.machineErrors ?? [];
                  // A completed run can still have per-machine failures; surface them full-width below the row
                  const hasMachineErrors = run.status !== "failed" && machineErrors.length > 0;

                  return (
                    <Fragment key={run.id}>
                      <TableRow className={hasMachineErrors ? "border-b-0" : undefined}>
                        <TableCell className="text-muted">
                          {run.startedAt
                            ? format(new Date(run.startedAt), "MMM d, yyyy h:mm a")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <RunStatusBadge status={run.status} />
                        </TableCell>
                        <TableCell className="text-muted">
                          {run.status === "failed" ? (
                            <span className="whitespace-pre-line text-danger">
                              {run.errorMessage}
                            </span>
                          ) : (
                            `${run.discoveredCount} found, ${run.newCount} new`
                          )}
                        </TableCell>
                      </TableRow>

                      {hasMachineErrors && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={3} className="pt-0 pb-4">
                            <div className="rounded-md border border-warning/20 bg-warning/[0.06] p-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                                <TriangleAlert className="size-4 shrink-0" />
                                The scan failed to find local accounts on certain machines
                              </div>
                              <ul className="mt-2 flex flex-col gap-1.5">
                                {machineErrors.map((m) => (
                                  <li key={m.machine} className="text-xs">
                                    <span className="font-medium text-foreground">{m.machine}</span>
                                    <span className="text-muted">: {m.error}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const tabContent: Partial<Record<PamSheetTab, ReactNode>> = {
    [PamSheetTab.General]: stagedTab,
    [PamSheetTab.Runs]: runsTab,
    [PamSheetTab.Configuration]: source ? (
      <ConfigurationTab source={source} onDirtyChange={setIsFormDirty} />
    ) : null
  };

  const tabs: PamDetailSheetTab[] = PAM_DISCOVERY_TABS.map((t) => ({
    value: t.value,
    label: t.label,
    icon: <t.icon className="mr-1 size-4" />,
    content: tabContent[t.value] ?? null
  }));

  return (
    <>
      <PamDetailSheet
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSelected({});
            setSearch("");
            setPage(1);
          }
          onOpenChange(open);
        }}
        isLoading={isOpen && !source}
        icon={
          <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
            {typeMeta?.icon ? (
              <img
                src={`/images/integrations/${typeMeta.icon}`}
                alt={typeMeta.name}
                className="size-10 rounded-sm"
              />
            ) : (
              <Radar className="size-8 text-muted" />
            )}
          </div>
        }
        title={source?.name}
        typeBadge={typeMeta?.name ?? "Active Directory"}
        badges={<DiscoveryStatusBadge status={runs[0]?.status} error={runs[0]?.errorMessage} />}
        metadata={[
          {
            label: "Credential Account",
            value: source?.credentialAccountId ? (
              <Link
                to="/organizations/$orgId/pam/accounts"
                params={{ orgId: currentOrg.id }}
                search={{ accountId: source.credentialAccountId }}
                className="font-medium text-foreground hover:underline"
              >
                {credentialAccountLabel}
              </Link>
            ) : (
              "None"
            )
          },
          { label: "Schedule", value: <span className="capitalize">{source?.schedule}</span> },
          {
            label: "Last Run",
            value: source?.lastRunAt
              ? format(new Date(source.lastRunAt), "MMM d, yyyy h:mm a")
              : "Never"
          }
        ]}
        footer={
          <Button
            variant="pam"
            size="xs"
            className="w-full"
            isPending={triggerScan.isPending}
            isDisabled={!source}
            onClick={handleScan}
          >
            <Play />
            Scan Now
          </Button>
        }
        tabs={tabs}
        activeTab={tab ?? PamSheetTab.General}
        onTabChange={setTab}
        isDirty={isFormDirty}
      />

      {sourceId && (
        <ImportDiscoveredModal
          isOpen={isImportOpen}
          onOpenChange={setIsImportOpen}
          sourceId={sourceId}
          accounts={selectedAccounts}
          onImported={() => setSelected({})}
        />
      )}
    </>
  );
};
