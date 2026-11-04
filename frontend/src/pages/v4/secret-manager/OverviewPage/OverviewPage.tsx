import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { GitCommitIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Loader } from "@app/components/v4/ui/loader";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import {
  Table,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { SecretType } from "@app/hooks/api/secrets/types";

import { useV4Adapter } from "../../data/adapters";
import { copyText, NOT_PORTED, ROW_ACTION_SLOTS, type RowContext } from "./cells";
import { ConfirmDeleteDialog, CreateSecretDialog, FolderDialog, type NewSecret } from "./dialogs";
import {
  childPath,
  type FolderEntry,
  parseFilterBy,
  parseTags,
  type ResourceKind,
  type Row,
  type SecretEntry,
  serializeFilterBy,
  toRows
} from "./model";
import { FolderRow, ImportRow, KindRow } from "./resource-rows";
import { SecretRow, type SecretRowHandlers } from "./secret-row";
import {
  AddNewMenu,
  ExportButton,
  FolderBreadcrumbBar,
  QuickAddRow,
  ResourceCount,
  ResourceFilterMenu
} from "./toolbar";

import styles from "./overview.module.css";

const ROUTE = "/v4/organizations/$orgId/projects/secret-management/$projectId/overview";

type SortField = `${DashboardSecretsOrderBy}`;
type Sort = { field: SortField; direction: "asc" | "desc"; environment?: string };
const sortOptions: { value: string; label: string; field: SortField; direction: "asc" | "desc" }[] =
  [
    { value: "name-asc", label: "Name (A to Z)", field: "name", direction: "asc" },
    { value: "name-desc", label: "Name (Z to A)", field: "name", direction: "desc" },
    { value: "updatedAt-desc", label: "Last edited (new)", field: "updatedAt", direction: "desc" },
    { value: "updatedAt-asc", label: "Last edited (old)", field: "updatedAt", direction: "asc" },
    { value: "createdAt-desc", label: "Created (new)", field: "createdAt", direction: "desc" },
    { value: "createdAt-asc", label: "Created (old)", field: "createdAt", direction: "asc" }
  ];

type Pending =
  | { type: "create-secret"; environments: string[]; name?: string }
  | { type: "create-folder" }
  | { type: "edit-folder"; entries: FolderEntry[] }
  | { type: "delete-folder"; entries: FolderEntry[] }
  | { type: "delete-secret"; secret: SecretEntry }
  | { type: "remove-override"; secret: SecretEntry }
  | { type: "delete-selection"; rows: Row[] };

const gate = (reason: string | undefined, node: ReactNode) =>
  reason ? (
    <Tooltip content={reason}>
      <span className={styles.actionSlot}>{node}</span>
    </Tooltip>
  ) : (
    node
  );

const errorText = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Please try again.";

export const OverviewPage = () => {
  const { projectId } = useParams({ from: ROUTE });
  const search = useSearch({ from: ROUTE });
  const navigate = useNavigate({ from: ROUTE });
  const secrets = useV4Adapter("secrets");
  const project = secrets.useProject(projectId);
  const tagList = secrets.useTags(projectId).data ?? [];
  const createSecret = secrets.useCreateSecret();
  const updateSecret = secrets.useUpdateSecret();
  const deleteSecret = secrets.useDeleteSecret();
  const deleteSecretBatch = secrets.useDeleteSecretBatch();
  const createFolder = secrets.useCreateFolder();
  const updateFolder = secrets.useUpdateFolder();
  const deleteFolder = secrets.useDeleteFolder();

  const path = search.secretPath || "/";
  const [query, setQuery] = useState(search.search);
  const [debounced, setDebounced] = useState(search.search);
  const [sort, setSort] = useState<Sort>({ field: "name", direction: "asc" });
  const [perPage, setPerPage] = useState(100);
  const [paging, setPaging] = useState({ scope: "", page: 1 });
  const [revealAll, setRevealAll] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending>();
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || pending) return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!root.current?.getClientRects().length) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, [pending]);

  const projectEnvironments = (project.data?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  const chosen = search.environments.filter((slug) =>
    projectEnvironments.some((environment) => environment.value === slug)
  );
  const visibleEnvironments = projectEnvironments.filter(
    (environment) => !chosen.length || chosen.includes(environment.value)
  );
  const single = visibleEnvironments.length === 1;
  const types = parseFilterBy(search.filterBy);
  const tags = parseTags(search.tags);
  const isFiltered = types.length > 0;
  const include = (kind: ResourceKind) => !isFiltered || types.includes(kind);
  const scope = JSON.stringify([path, chosen, debounced, types, tags, sort, perPage]);
  const page = paging.scope === scope ? paging.page : 1;
  const setPage = (next: number) => setPaging({ scope, page: next });

  const overview = secrets.useOverview({
    projectId,
    environments: visibleEnvironments.map((environment) => environment.value),
    secretPath: path,
    orderBy: sort.field as DashboardSecretsOrderBy,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
    sortEnvironment: sort.environment,
    includeFolders: include("folder"),
    includeDynamicSecrets: include("dynamic"),
    includeSecrets: tags.length > 0 || include("secret"),
    includeImports: include("import"),
    includeSecretRotations: include("rotation"),
    includeHoneyTokens: include("honey"),
    includeProxiedServices: include("proxy"),
    search: debounced,
    tags: Object.fromEntries(tags.map((tag) => [tag, true])),
    limit: perPage,
    offset: (page - 1) * perPage
  });

  if (project.isPending) return <Loader size="page" label="Loading project" />;
  if (!project.data)
    return (
      <EmptyState
        icon="alert"
        title="Could not load this project"
        description={errorText(project.error)}
      />
    );

  const projectName = project.data.name;
  const noEnvironments = !projectEnvironments.length;
  const legacy = project.data.version !== ProjectVersion.V3;
  const failed = Boolean(overview.error);
  const unavailable = noEnvironments || legacy || failed;
  const writeBlock = unavailable ? "Resources are not available right now" : undefined;
  const loading = overview.isPending && !unavailable;
  const { data } = overview;
  const rows = unavailable ? [] : toRows(data);
  const totalCount = data?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
  const isLastPage = page >= pageCount;
  const totals: Partial<Record<ResourceKind, number>> = {
    import: data?.totalImportCount,
    folder: data?.totalFolderCount,
    dynamic: data?.totalDynamicSecretCount,
    rotation: data?.totalSecretRotationCount,
    honey: data?.totalHoneyTokenCount,
    proxy: data?.totalProxiedServiceCount,
    secret: data?.totalSecretCount
  };
  const hasQuery = Boolean(query.trim());
  const isNarrowed = hasQuery || isFiltered || tags.length > 0;
  const selectable = rows.filter((row) => row.kind === "secret" || row.kind === "folder");
  const selectableKeys = selectable.map((row) => row.key);
  const selectedRows = selectable.filter((row) => selected.includes(row.key));
  const allOnPage =
    selectableKeys.length > 0 && selectableKeys.every((key) => selected.includes(key));
  const someOnPage = selectableKeys.some((key) => selected.includes(key));
  const managedSelected = selectedRows.some(
    (row) =>
      row.kind === "secret" &&
      row.entries.some((entry) => entry.isRotatedSecret || entry.isHoneyTokenSecret)
  );
  const colSpan = visibleEnvironments.length + 3;
  const tagOptions = tagList.map((tag) => tag.slug);
  const sortLabel = sortOptions.find(
    (option) => option.field === sort.field && option.direction === sort.direction
  )?.label;

  const report = (message: string) => setNotice(message);
  const run = async (task: () => Promise<unknown>, done: string, failure: string) => {
    try {
      await task();
      setNotice(done);
    } catch (error) {
      setNotice(`${failure} ${errorText(error)}`);
    }
  };
  const updateSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }) });
  const resetView = () => {
    setSelected([]);
    setNotice("");
  };
  const openPath = (nextPath: string) => {
    setQuery("");
    setDebounced("");
    resetView();
    updateSearch({ secretPath: nextPath, search: "" });
  };
  const createIn = (secret: NewSecret) =>
    Promise.all(
      secret.environments.map((environment) =>
        createSecret.mutateAsync({
          projectId,
          environment,
          secretPath: path,
          secretKey: secret.key,
          secretValue: secret.value,
          secretComment: secret.comment,
          tagIds: secret.tagIds,
          type: SecretType.Shared
        })
      )
    );
  const secretDto = (secret: SecretEntry) => ({
    projectId,
    environment: secret.env,
    secretPath: path,
    secretKey: secret.key
  });
  const handlers: SecretRowHandlers = {
    onCreateIn: (environment, name) =>
      setPending({ type: "create-secret", environments: [environment], name }),
    onDelete: (secret) => setPending({ type: "delete-secret", secret }),
    onUpdateValue: (secret, value) =>
      run(
        () =>
          updateSecret.mutateAsync({
            ...secretDto(secret),
            secretValue: value,
            type: SecretType.Shared
          }),
        `Updated ${secret.key}.`,
        `Failed to update ${secret.key}.`
      ),
    onToggleMultiline: (secret) =>
      run(
        () =>
          updateSecret.mutateAsync({
            ...secretDto(secret),
            skipMultilineEncoding: !secret.skipMultilineEncoding,
            type: SecretType.Shared
          }),
        `Multi-line encoding ${secret.skipMultilineEncoding ? "enabled" : "disabled"} for ${secret.key}.`,
        `Failed to update ${secret.key}.`
      ),
    onSaveOverride: (secret, value, creating) =>
      run(
        () =>
          creating
            ? createSecret.mutateAsync({
                ...secretDto(secret),
                secretValue: value,
                secretComment: "",
                type: SecretType.Personal
              })
            : updateSecret.mutateAsync({
                ...secretDto(secret),
                secretValue: value,
                type: SecretType.Personal
              }),
        `${creating ? "Created" : "Updated"} your personal override for ${secret.key}.`,
        `Failed to save the override for ${secret.key}.`
      ),
    onRemoveOverride: (secret) => setPending({ type: "remove-override", secret })
  };
  const ctx: RowContext = {
    projectId,
    environments: visibleEnvironments,
    single,
    path,
    writeBlock,
    selected,
    onToggleSelect: (key) =>
      setSelected(
        selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]
      ),
    report
  };
  const deleteRows = async (targets: Row[]) => {
    const secretRows = targets.filter(
      (row): row is Extract<Row, { kind: "secret" }> => row.kind === "secret"
    );
    const folderEntries = targets.flatMap((row) => (row.kind === "folder" ? row.entries : []));
    await Promise.all([
      ...visibleEnvironments.map((environment) => {
        const keys = secretRows.flatMap((row) =>
          row.entries.filter((entry) => entry.env === environment.value).map((entry) => entry.key)
        );
        return keys.length
          ? deleteSecretBatch.mutateAsync({
              projectId,
              environment: environment.value,
              secretPath: path,
              secrets: keys.map((secretKey) => ({ secretKey, type: SecretType.Shared }))
            })
          : undefined;
      }),
      ...folderEntries.map((entry) =>
        deleteFolder.mutateAsync({
          projectId,
          environment: entry.environment,
          folderId: entry.id,
          path
        })
      )
    ]);
    setSelected([]);
  };

  const emptyState = (() => {
    if (hasQuery)
      return (
        <EmptyState
          icon="search"
          title="No matches in this folder"
          description="Try a different search, or search every folder in this environment."
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setDebounced("");
                }}
              >
                Clear search
              </Button>
              {gate(
                NOT_PORTED,
                <Button variant="outline" disabled>
                  Search all folders
                </Button>
              )}
            </>
          }
        />
      );
    if (isNarrowed)
      return (
        <EmptyState
          icon="search"
          title="No resources match these filters"
          actions={
            <Button
              variant="outline"
              onClick={() => updateSearch({ filterBy: undefined, tags: undefined })}
            >
              Clear filters
            </Button>
          }
        />
      );
    return (
      <EmptyState
        icon="upload"
        title="This folder is empty"
        description="Add a secret or a folder to get started."
        actions={
          <>
            {gate(
              NOT_PORTED,
              <Button variant="outline" icon="upload" disabled>
                Upload secrets
              </Button>
            )}
            <Button
              icon="plus"
              onClick={() =>
                setPending({
                  type: "create-secret",
                  environments: visibleEnvironments.map((environment) => environment.value)
                })
              }
            >
              Add a new secret
            </Button>
          </>
        }
      />
    );
  })();
  const unavailableState = (() => {
    if (noEnvironments)
      return (
        <EmptyState
          icon="folder"
          title="No environments yet"
          description="Create an environment before adding secrets."
          actions={gate(
            NOT_PORTED,
            <Button icon="plus" disabled>
              Add environment
            </Button>
          )}
        />
      );
    if (legacy)
      return (
        <EmptyState
          icon="lock"
          title="Secrets engine upgrade required"
          description="This project uses the legacy engine. Upgrade the project to manage secrets here."
          actions={gate(NOT_PORTED, <Button disabled>Upgrade project</Button>)}
        />
      );
    if (failed)
      return (
        <EmptyState
          icon="alert"
          title="Could not load resources"
          description={`The overview request failed. ${errorText(overview.error)}`}
          actions={<Button onClick={() => overview.refetch()}>Retry</Button>}
        />
      );
    return undefined;
  })();
  const sortMenu = (
    <DropdownMenu>
      <Tooltip content={`Sort: ${sortLabel ?? "Name (A to Z)"}`}>
        <span className={styles.actionSlot}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" icon="chev-down" iconOnly>
              Sort resources
            </Button>
          </DropdownMenuTrigger>
        </span>
      </Tooltip>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.environment ? "" : `${sort.field}-${sort.direction}`}
          onValueChange={(value) => {
            const option = sortOptions.find((entry) => entry.value === value);
            if (option) setSort({ field: option.field, direction: option.direction });
          }}
        >
          {sortOptions
            .filter((option) => single || option.field === "name")
            .map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const environmentMenu = (environment: { value: string; label: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" iconRight="chev-down">
          {environment.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Sort secrets by recency</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{`Use ${environment.label} timestamps`}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={
                sort.environment === environment.value ? `${sort.field}-${sort.direction}` : ""
              }
              onValueChange={(value) => {
                const option = sortOptions.find((entry) => entry.value === value);
                if (option)
                  setSort({
                    field: option.field,
                    direction: option.direction,
                    environment: environment.value
                  });
              }}
            >
              {sortOptions
                .filter((option) => option.field !== "name")
                .map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            copyText(
              environment.value,
              "Environment slug copied to clipboard.",
              "Failed to copy the environment slug.",
              report
            )
          }
        >
          <Icon name="copy" />
          Copy environment slug
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NOT_PORTED}>
          <Icon name="download" />
          Download as .env
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NOT_PORTED}>
          <Icon icon={GitCommitIcon} />
          View commit history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled description={writeBlock ?? NOT_PORTED}>
          <Icon name="trash" />
          Delete environment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderRow = (row: Row) => {
    if (row.kind === "import")
      return <ImportRow key={row.key} row={row} ctx={ctx} projectName={projectName} />;
    if (row.kind === "folder")
      return (
        <FolderRow
          key={row.key}
          row={row}
          ctx={ctx}
          onOpen={() => openPath(childPath(path, row.name))}
          onEdit={(entries) => setPending({ type: "edit-folder", entries })}
          onDelete={(entries) => setPending({ type: "delete-folder", entries })}
        />
      );
    if (row.kind === "secret")
      return (
        <SecretRow key={row.key} row={row} ctx={ctx} revealAll={revealAll} handlers={handlers} />
      );
    return <KindRow key={row.key} row={row} ctx={ctx} />;
  };

  return (
    <div ref={root} className={styles.page}>
      <PageHeader size="md" title={projectName} mono />
      <div className={styles.toolbar}>
        <div className={styles.envPicker}>
          <MultiSelect
            label="Environments"
            options={projectEnvironments}
            value={chosen}
            onChange={(value) => {
              setSort({ field: "name", direction: "asc" });
              resetView();
              updateSearch({ environments: value });
            }}
            placeholder="All environments"
            allLabel="All environments"
            searchable
            disabled={noEnvironments || legacy}
          />
        </div>
        <div className={styles.search}>
          <Input
            ref={searchInput}
            aria-label="Search resources"
            icon="search"
            placeholder="Search by secret or folder name..."
            kbd="/"
            value={query}
            disabled={unavailable}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected([]);
            }}
          />
        </div>
        <ResourceFilterMenu
          types={types}
          onToggleType={(kind) => {
            resetView();
            updateSearch({
              filterBy: serializeFilterBy(
                types.includes(kind) ? types.filter((entry) => entry !== kind) : [...types, kind]
              )
            });
          }}
          tags={tagOptions}
          selectedTags={tags}
          onToggleTag={(tag) => {
            resetView();
            const next = tags.includes(tag)
              ? tags.filter((entry) => entry !== tag)
              : [...tags, tag];
            updateSearch({ tags: next.join(",") || undefined });
          }}
          onClearTags={() => {
            resetView();
            updateSearch({ tags: undefined });
          }}
        />
        <ExportButton
          disabledReason={single ? NOT_PORTED : "Select a single environment to export secrets"}
        />
        <AddNewMenu
          writeBlock={writeBlock}
          onAdd={(kind) =>
            setPending(
              kind === "secret"
                ? {
                    type: "create-secret",
                    environments: visibleEnvironments.map((environment) => environment.value)
                  }
                : { type: "create-folder" }
            )
          }
        />
      </div>
      <div className={styles.tableBlock}>
        <div className={styles.tableFrame}>
          <FolderBreadcrumbBar path={path} single={single} onNavigate={openPath} report={report} />
          {unavailableState ?? (
            <Table
              className={styles.table}
              data-mode={single ? "single" : "multi"}
              aria-label={`Resources in ${projectName} at ${path}`}
            >
              <colgroup>
                <col className={styles.colIcon} />
                <col className={single ? styles.colName : styles.colNameMulti} />
                {single ? (
                  <col />
                ) : (
                  visibleEnvironments.map((environment) => <col key={environment.value} />)
                )}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.iconCell}>
                    <span className={styles.iconSlot}>
                      <Checkbox
                        aria-label="Select all resources on this page"
                        checked={allOnPage}
                        indeterminate={someOnPage && !allOnPage}
                        disabled={!selectableKeys.length}
                        onCheckedChange={() =>
                          setSelected(
                            allOnPage
                              ? selected.filter((key) => !selectableKeys.includes(key))
                              : [...new Set([...selected, ...selectableKeys])]
                          )
                        }
                      />
                    </span>
                  </TableHead>
                  <TableHead>
                    <div className={styles.headLine}>
                      Name
                      <span className={styles.push}>{sortMenu}</span>
                    </div>
                  </TableHead>
                  {single ? (
                    <TableHead>
                      <div className={`${styles.headLine} ${styles.valueHead}`}>
                        Value
                        <span className={styles.push}>
                          <Button
                            variant="ghost"
                            size="xs"
                            icon="eye"
                            onClick={() => setRevealAll(!revealAll)}
                          >
                            {revealAll ? "Hide values" : "Reveal all"}
                          </Button>
                          {gate(
                            NOT_PORTED,
                            <Button variant="ghost" size="xs" icon="git" disabled>
                              <span className={styles.headLabel}>Commits</span>
                            </Button>
                          )}
                        </span>
                      </div>
                    </TableHead>
                  ) : (
                    visibleEnvironments.map((environment) => (
                      <TableHead key={environment.value} className={styles.envHead}>
                        <div className={styles.headLine}>{environmentMenu(environment)}</div>
                      </TableHead>
                    ))
                  )}
                  <TableActionsHead slots={ROW_ACTION_SLOTS} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading &&
                  Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={`skeleton-${index + 1}`}>
                      <TableCell className={styles.iconCell}>
                        <Skeleton width="var(--v4-size-icon)" height="var(--v4-size-icon)" />
                      </TableCell>
                      <TableCell colSpan={colSpan - 1}>
                        <Skeleton width="var(--v4-size-text-min)" height="var(--v4-size-icon)" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && totalCount === 0 && (
                  <TableRow>
                    <TableCell colSpan={colSpan} className={styles.emptyCell}>
                      {emptyState}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rows.map(renderRow)}
                {!loading && !writeBlock && isLastPage && totalCount > 0 && (
                  <QuickAddRow
                    multiple={!single}
                    colSpan={(single ? 1 : visibleEnvironments.length) + 1}
                    existing={rows.filter((row) => row.kind === "secret").map((row) => row.name)}
                    onCreate={(key, value) =>
                      run(
                        () =>
                          createIn({
                            key,
                            value,
                            comment: "",
                            tagIds: [],
                            environments: visibleEnvironments.map(
                              (environment) => environment.value
                            )
                          }),
                        `Created ${key}.`,
                        `Failed to create ${key}.`
                      )
                    }
                  />
                )}
              </TableBody>
            </Table>
          )}
        </div>
        {(totalCount > 0 || notice) && (
          <div className={styles.footer}>
            {notice ? (
              <p role="status" className={styles.notice}>
                {notice}
              </p>
            ) : (
              <ResourceCount counts={totals} />
            )}
            {!unavailableState && totalCount > 0 && (
              <div className={styles.pagination}>
                <Pagination
                  page={Math.min(page, pageCount)}
                  total={totalCount}
                  pageSize={perPage}
                  pageSizeOptions={[10, 20, 50, 100]}
                  onPageChange={(value) => {
                    setPage(value);
                    setSelected([]);
                  }}
                  onPageSizeChange={(value) => {
                    setPerPage(value);
                    setSelected([]);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <FloatingActionBar
        placement="fixed"
        count={selected.length}
        total={selectableKeys.length}
        onSelectAll={() => setSelected(selectableKeys)}
        onClear={() => setSelected([])}
        noun="resources"
        actions={[
          { label: "Add tags", icon: "plus", disabled: true, onClick: () => undefined },
          { label: "Move", icon: "folder", disabled: true, onClick: () => undefined },
          { label: "Copy to clipboard", icon: "copy", disabled: true, onClick: () => undefined },
          {
            label: "Delete",
            icon: "trash",
            danger: true,
            disabled: Boolean(writeBlock) || managedSelected || !selectedRows.length,
            onClick: () => setPending({ type: "delete-selection", rows: selectedRows })
          }
        ]}
      />
      {pending?.type === "create-secret" && (
        <CreateSecretDialog
          environments={visibleEnvironments}
          initial={pending}
          tagOptions={tagList.map((tag) => ({ value: tag.id, label: tag.slug }))}
          onClose={() => setPending(undefined)}
          onCreate={async (secret) => {
            await run(
              () => createIn(secret),
              `Created ${secret.key}.`,
              `Failed to create ${secret.key}.`
            );
            setPending(undefined);
          }}
        />
      )}
      {pending?.type === "create-folder" && (
        <FolderDialog
          mode="create"
          onClose={() => setPending(undefined)}
          onSave={async (name, description) => {
            await run(
              () =>
                Promise.all(
                  visibleEnvironments.map((environment) =>
                    createFolder.mutateAsync({
                      projectId,
                      environment: environment.value,
                      name,
                      path,
                      description
                    })
                  )
                ),
              "Successfully created folder.",
              "Failed to create folder."
            );
            setPending(undefined);
          }}
        />
      )}
      {pending?.type === "edit-folder" && (
        <FolderDialog
          mode="edit"
          name={pending.entries[0].name}
          description={pending.entries[0].description ?? ""}
          showDescriptionOverwriteWarning={!single && pending.entries.length > 1}
          onClose={() => setPending(undefined)}
          onSave={async (name, description) => {
            await run(
              () =>
                Promise.all(
                  pending.entries.map((entry) =>
                    updateFolder.mutateAsync({
                      projectId,
                      environment: entry.environment,
                      folderId: entry.id,
                      name,
                      path,
                      description
                    })
                  )
                ),
              single
                ? `Folder "${name}" updated.`
                : "Successfully renamed folder across environments.",
              "Failed to update folder."
            );
            setPending(undefined);
          }}
        />
      )}
      {pending?.type === "delete-folder" && (
        <ConfirmDeleteDialog
          title={`Delete folder ${pending.entries[0].name}`}
          description={`This deletes the folder and everything inside it in ${pending.entries.length} environment${pending.entries.length === 1 ? "" : "s"}. This cannot be undone.`}
          action="Delete folder"
          onClose={() => setPending(undefined)}
          onConfirm={() =>
            run(
              () =>
                Promise.all(
                  pending.entries.map((entry) =>
                    deleteFolder.mutateAsync({
                      projectId,
                      environment: entry.environment,
                      folderId: entry.id,
                      path
                    })
                  )
                ),
              `Folder "${pending.entries[0].name}" deleted.`,
              "Failed to delete folder."
            )
          }
        />
      )}
      {pending?.type === "delete-secret" && (
        <ConfirmDeleteDialog
          title={`Delete ${pending.secret.key}`}
          description={`This deletes ${pending.secret.key} from ${visibleEnvironments.find((environment) => environment.value === pending.secret.env)?.label ?? pending.secret.env}. This cannot be undone.`}
          action="Delete secret"
          onClose={() => setPending(undefined)}
          onConfirm={() =>
            run(
              () =>
                deleteSecret.mutateAsync({ ...secretDto(pending.secret), type: SecretType.Shared }),
              `Deleted ${pending.secret.key}.`,
              `Failed to delete ${pending.secret.key}.`
            )
          }
        />
      )}
      {pending?.type === "remove-override" && (
        <ConfirmDeleteDialog
          title="Remove override"
          description="Are you sure you want to remove this personal override? The shared secret value will be used instead."
          action="Remove"
          onClose={() => setPending(undefined)}
          onConfirm={() =>
            run(
              () =>
                deleteSecret.mutateAsync({
                  ...secretDto(pending.secret),
                  type: SecretType.Personal
                }),
              `Removed your personal override for ${pending.secret.key}.`,
              "Failed to remove the override."
            )
          }
        />
      )}
      {pending?.type === "delete-selection" && (
        <ConfirmDeleteDialog
          title={`Delete ${pending.rows.length} resource${pending.rows.length === 1 ? "" : "s"}`}
          description={`This deletes ${pending.rows.map((row) => row.name).join(", ")} from ${single ? "this environment" : "every visible environment"}. This cannot be undone.`}
          action="Delete"
          onClose={() => setPending(undefined)}
          onConfirm={() =>
            run(
              () => deleteRows(pending.rows),
              `Deleted ${pending.rows.map((row) => row.name).join(", ")}.`,
              "Failed to delete the selected resources."
            )
          }
        />
      )}
    </div>
  );
};
