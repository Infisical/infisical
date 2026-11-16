import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Badge, Count } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Input } from "@infisical/cipher/ui/input";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { RowLink } from "@infisical/cipher/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import {
  type DashboardSecretValue,
  SecretMetadataSearchLogicalOperator,
  SecretMetadataSearchOperator,
  type TDashboardProjectSecretsQuickSearch,
  type TGetSecretValueDTO,
  type TSearchSecretsByMetadataResponse
} from "@app/hooks/api/dashboard/types";
import type { ProjectEnv } from "@app/hooks/api/projects/types";
import type { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";
import { useResetPageHelper } from "@app/hooks/useResetPageHelper";

import { errorMessage, failed, toast } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { v4Path } from "../../../../links";
import type { ResourceKind } from "../../secrets-model";
import { KindIcon } from "../overview-cells";

import styles from "./search-all-folders.module.css";

const OVERVIEW = v4Path("/organizations/$orgId/projects/secret-management/$projectId/overview");
const PAGE_SIZES = [25, 50, 100];

type SearchKind = Extract<ResourceKind, "folder" | "secret" | "dynamic" | "rotation">;
type Metadata = { key: string; value: string | null };
type Condition = { id: number; key: string; value: string };
type Filters = {
  environments: string[];
  folderPath: string;
  kinds: SearchKind[];
  tags: string[];
  conditions: Condition[];
  match: "all" | "any";
};
type Hit = {
  id: string;
  kind: SearchKind;
  name: string;
  environment: string;
  location: string;
  metadata: Metadata[];
  tags: string[];
  valueHidden: boolean;
  matched?: string;
};
type Results = { hits: Hit[]; total: number; limitNote?: string };

const KINDS: { kind: SearchKind; label: string; filterBy?: string }[] = [
  { kind: "folder", label: "Folders" },
  { kind: "dynamic", label: "Dynamic secrets", filterBy: "dynamic" },
  { kind: "rotation", label: "Secret rotations", filterBy: "rotation" },
  { kind: "secret", label: "Secrets", filterBy: "secret" }
];
const ALL_KINDS = KINDS.map((entry) => entry.kind);
const blankCondition = (id: number): Condition => ({ id, key: "", value: "" });
const nextId = (conditions: Condition[]) =>
  Math.max(0, ...conditions.map((condition) => condition.id)) + 1;
const INITIAL_FILTERS: Filters = {
  environments: [],
  folderPath: "/",
  kinds: ALL_KINDS,
  tags: [],
  conditions: [blankCondition(1)],
  match: "all"
};

const includesText = (text: string, needle: string) =>
  Boolean(needle) && text.toLowerCase().includes(needle);

const metadataResults = (
  data: TSearchSecretsByMetadataResponse | undefined,
  needle: string,
  page: number,
  perPage: number
): Results => {
  const matches = (data?.secrets ?? [])
    .filter(
      (secret) =>
        !needle || includesText(secret.secretKey, needle) || includesText(secret.secretPath, needle)
    )
    .sort(
      (a, b) => a.secretKey.localeCompare(b.secretKey) || a.secretPath.localeCompare(b.secretPath)
    );
  return {
    total: matches.length,
    hits: matches.slice((page - 1) * perPage, page * perPage).map((secret) => ({
      id: secret.secretId,
      kind: "secret",
      name: secret.secretKey,
      environment: secret.environment,
      location: secret.secretPath,
      metadata: secret.metadata,
      tags: secret.tags.map((tag) => tag.slug),
      valueHidden: secret.secretValueHidden
    })),
    limitNote: matches.length
      ? `Checks up to ${data?.searchLimit ?? 100} candidates per metadata query. Narrow your filters to see the rest.`
      : undefined
  };
};

const secretHit = (
  secret: TDashboardProjectSecretsQuickSearch["secrets"][string][number],
  needle: string
): Hit => {
  const tagMatch = secret.tags?.find((tag) => includesText(tag.slug, needle));
  const metadataMatch = secret.secretMetadata?.some(
    (entry) => includesText(entry.key, needle) || includesText(entry.value ?? "", needle)
  );
  let matched: string | undefined;
  if (!includesText(secret.key, needle)) {
    if (tagMatch) matched = `Matched tag ${tagMatch.slug}`;
    else if (metadataMatch) matched = "Matched metadata";
  }
  return {
    id: `secret:${secret.id}`,
    kind: "secret",
    name: secret.key,
    environment: secret.env,
    location: secret.path ?? "/",
    metadata: (secret.secretMetadata ?? []).map(({ key, value }) => ({
      key,
      value
    })),
    tags: (secret.tags ?? []).map((tag) => tag.slug),
    valueHidden: secret.secretValueHidden,
    matched
  };
};

const quickResults = (
  data: TDashboardProjectSecretsQuickSearch,
  needle: string,
  kinds: SearchKind[],
  environments: ProjectEnv[],
  perPage: number
): Results => {
  const shown = new Set(kinds);
  const slugById = new Map(environments.map((environment) => [environment.id, environment.slug]));
  const plain = { metadata: [], tags: [], valueHidden: true };
  const hits: Hit[] = [
    ...(shown.has("folder") ? Object.values(data.folders).flat() : []).map((folder): Hit => ({
      ...plain,
      id: `folder:${folder.id}`,
      kind: "folder",
      name: folder.name,
      environment: slugById.get(folder.envId) ?? folder.envId,
      location: folder.path
    })),
    ...(shown.has("dynamic") ? Object.values(data.dynamicSecrets).flat() : []).map(
      (entry): Hit => ({
        ...plain,
        id: `dynamic:${entry.id}`,
        kind: "dynamic",
        name: entry.name,
        environment: entry.environment,
        location: entry.path
      })
    ),
    ...(shown.has("rotation") ? Object.values(data.secretRotations).flat() : []).map(
      (entry): Hit => ({
        ...plain,
        id: `rotation:${entry.id}`,
        kind: "rotation",
        name: entry.name,
        environment: entry.environment.slug,
        location: entry.folder.path
      })
    ),
    ...(shown.has("secret") ? Object.values(data.secrets).flat() : []).map((secret) =>
      secretHit(secret, needle)
    )
  ];
  const visible = Math.max(
    shown.has("folder") ? data.totalFolderCount : 0,
    shown.has("secret") ? data.totalSecretCount : 0,
    shown.has("dynamic") ? data.totalDynamicSecretCount : 0,
    shown.has("rotation") ? data.totalSecretRotationCount : 0
  );
  const total = Math.min(visible, data.searchLimit + perPage);
  return {
    hits,
    total,
    limitNote:
      data.isSearchLimitReached || total < visible
        ? `Only the first ${data.searchLimit} matches per resource type can be reached. Narrow your search to see the rest.`
        : undefined
  };
};

const withMetadataCondition = (conditions: Condition[], { key, value }: Metadata) => {
  if (!value) return conditions;
  if (conditions.some((entry) => entry.key.trim() === key && entry.value.trim() === value))
    return conditions;
  const blank = conditions.find((entry) => !entry.key.trim() && !entry.value.trim());
  if (blank)
    return conditions.map((entry) => (entry.id === blank.id ? { ...entry, key, value } : entry));
  return [...conditions, { id: nextId(conditions), key, value }];
};

function MetadataBadges({
  metadata,
  onFilter
}: {
  metadata: Metadata[];
  onFilter: (entry: Metadata) => void;
}) {
  return metadata.map((entry) => (
    <HoverCard key={`${entry.key}:${entry.value ?? ""}`} openDelay={200} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Badge
          tone="outline"
          mono
          tabIndex={0}
          data-row-interactive
          aria-label={`${entry.key}: ${entry.value || "empty"}`}
          className={styles.metaBadge}
        >
          <span className={styles.metaKey}>{entry.key}</span>
          <span className={styles.metaValue}>{entry.value || "Empty"}</span>
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <div className={styles.metaCard}>
          <code className={styles.metaKey}>{entry.key}</code>
          <code className={styles.metaFull}>{entry.value || "Empty"}</code>
          <Button
            variant="outline"
            size="xs"
            icon="search"
            disabledReason={entry.value ? undefined : "This metadata has no value to match"}
            onClick={() => onFilter(entry)}
          >
            Filter by this
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  ));
}

function MetadataConditions({
  filters,
  onChange
}: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const { conditions, match } = filters;
  const updateCondition = (id: number, patch: Partial<Condition>) =>
    onChange({
      conditions: conditions.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    });
  return (
    <FieldSet
      legend="Metadata"
      legendVariant="label"
      actions={
        <ToggleGroup
          type="single"
          size="sm"
          aria-label="Match metadata conditions"
          value={match}
          onValueChange={(value) => value && onChange({ match: value as Filters["match"] })}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="any">Any</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <div className={styles.conditions}>
        {conditions.map((condition, index) => (
          <div key={condition.id} className={styles.condition}>
            {index > 0 && <span className={styles.joiner}>{match === "all" ? "and" : "or"}</span>}
            <div className={styles.conditionFields}>
              <Input
                mono
                aria-label={`Metadata key ${index + 1}`}
                placeholder="Key"
                value={condition.key}
                onChange={(event) => updateCondition(condition.id, { key: event.target.value })}
              />
              <span className={styles.operator}>is</span>
              <Input
                mono
                aria-label={`Metadata value ${index + 1}`}
                placeholder="Value"
                value={condition.value}
                onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
              />
              {index > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  icon="x"
                  iconOnly
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() =>
                    onChange({
                      conditions: conditions.filter((entry) => entry.id !== condition.id)
                    })
                  }
                />
              )}
            </div>
          </div>
        ))}
        <span>
          <Button
            variant="ghost"
            size="sm"
            icon="plus"
            onClick={() =>
              onChange({
                conditions: [...conditions, blankCondition(nextId(conditions))]
              })
            }
          >
            Add condition
          </Button>
        </span>
      </div>
    </FieldSet>
  );
}

function SearchFilters({
  environments,
  tagOptions,
  folderTree,
  folderEnvironment,
  filters,
  activeCount,
  shown,
  onChange
}: {
  environments: ProjectEnv[];
  tagOptions: { slug: string }[];
  folderTree?: TProjectEnvironmentsFolders;
  folderEnvironment?: string;
  filters: Filters;
  activeCount: number;
  shown: (kind: SearchKind) => boolean;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const metadataReset = {
    conditions: [blankCondition(nextId(filters.conditions))],
    match: "all" as const
  };
  const toggleKind = (kind: SearchKind, checked: boolean) => {
    const kinds = checked
      ? [...filters.kinds, kind]
      : filters.kinds.filter((entry) => entry !== kind);
    const withSecrets = kinds.includes("secret");
    onChange({
      kinds,
      ...(withSecrets ? {} : { tags: [] }),
      ...(!withSecrets || kinds.some((entry) => entry !== "secret") ? metadataReset : {})
    });
  };
  const folderOptions = [
    ...new Set(
      Object.values(folderTree ?? {})
        .find((environment) => environment.slug === folderEnvironment)
        ?.folders.map((folder) => folder.path) ?? []
    )
  ]
    .filter((path) => path !== "/")
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({ value: path, label: path }));

  return (
    <Card
      variant="framed"
      size="sm"
      title="Filters"
      badges={activeCount > 0 ? <Count>{activeCount}</Count> : undefined}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...INITIAL_FILTERS, ...metadataReset })}
          disabled={!activeCount}
        >
          Reset
        </Button>
      }
    >
      <div className={styles.filterFields}>
        {environments.length > 1 && (
          <Field label="Environments">
            <Combobox
              multiple
              label="Environments"
              placeholder="All environments"
              options={environments.map((environment) => ({
                value: environment.slug,
                label: environment.name
              }))}
              value={filters.environments}
              onChange={(value) => onChange({ environments: value, folderPath: "/" })}
              clearable
            />
          </Field>
        )}
        <Field
          label="Folder"
          description={folderEnvironment ? undefined : "Select one environment to choose a folder."}
        >
          <Combobox
            key={folderEnvironment ?? "all"}
            label="Folder"
            placeholder="All folders"
            options={folderOptions}
            value={filters.folderPath === "/" ? "" : filters.folderPath}
            onChange={(value) => onChange({ folderPath: value || "/" })}
            disabled={!folderEnvironment}
            clearable
            clearLabel="Search all folders"
            emptyText="No folders found."
          />
        </Field>
        <Field label="Resource types" group>
          <div className={styles.kinds}>
            {KINDS.map((entry) => (
              <Checkbox
                key={entry.kind}
                label={entry.label}
                media={<KindIcon kind={entry.kind} />}
                checked={shown(entry.kind)}
                onChange={(checked) => toggleKind(entry.kind, checked)}
              />
            ))}
          </div>
        </Field>
        <Field label="Tags">
          <Combobox
            multiple
            label="Tags"
            placeholder="Any tag"
            options={tagOptions.map((tag) => ({
              value: tag.slug,
              label: tag.slug
            }))}
            value={filters.tags}
            onChange={(value) =>
              onChange({
                tags: value,
                ...(value.length && !filters.kinds.includes("secret")
                  ? { kinds: [...filters.kinds, "secret"] }
                  : {})
              })
            }
            emptyText="No tags found."
            clearable
          />
        </Field>
        <MetadataConditions filters={filters} onChange={onChange} />
      </div>
    </Card>
  );
}

function ResultsTable({
  orgId,
  projectId,
  environments,
  results,
  loading,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
  onSelect,
  onFilterMetadata,
  readSecretValue
}: {
  orgId: string;
  projectId: string;
  environments: ProjectEnv[];
  results: Results;
  loading: boolean;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  onSelect: (selection: { path: string; search: string }) => void;
  onFilterMetadata: (entry: Metadata) => void;
  readSecretValue: (dto: TGetSecretValueDTO) => Promise<DashboardSecretValue>;
}) {
  const { hits, total, limitNote } = results;
  const groups = environments
    .map((environment) => ({
      id: environment.slug,
      label: environment.name,
      rows: hits.filter((hit) => hit.environment === environment.slug)
    }))
    .filter((group) => group.rows.length)
    .map((group) => ({ ...group, meta: String(group.rows.length) }));

  const copyValue = async (hit: Hit) => {
    try {
      const data = await readSecretValue({
        projectId,
        environment: hit.environment,
        secretPath: hit.location,
        secretKey: hit.name
      });
      const value = data.valueOverride ?? data.value;
      if (value === undefined) {
        toast({
          tone: "bad",
          title: "Secret value is unavailable. Refresh the results and try again"
        });
        return;
      }
      await navigator.clipboard.writeText(value);
      toast({ tone: "ok", title: "Secret value copied" });
    } catch (error) {
      failed("Couldn't copy the secret value", error);
    }
  };
  const searchOf = (hit: Hit) => (hit.kind === "folder" ? "" : hit.name);
  const select = (event: MouseEvent, hit: Hit) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    onSelect({ path: hit.location, search: searchOf(hit) });
  };

  const columns: DataTableColumn<Hit>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 240,
      text: (hit) => hit.name,
      render: (hit) => (
        <span className={styles.name} data-mono={hit.kind === "secret" || undefined}>
          <KindIcon kind={hit.kind} />
          <RowLink
            title={hit.name}
            link={{
              to: OVERVIEW,
              params: { orgId, projectId },
              search: {
                secretPath: hit.location,
                environments: [hit.environment],
                search: searchOf(hit),
                filterBy: KINDS.find((entry) => entry.kind === hit.kind)?.filterBy
              }
            }}
            onClickCapture={(event) => select(event, hit)}
          >
            {hit.name}
          </RowLink>
        </span>
      ),
      secondary: (hit) => hit.matched
    },
    {
      id: "location",
      header: "Location",
      mono: true,
      width: 220,
      text: (hit) => hit.location,
      render: (hit) => <MiddleTruncate mono keepEnd={24} text={hit.location} />
    },
    {
      id: "metadata",
      header: "Metadata",
      width: 300,
      minWidth: 280,
      text: (hit) => hit.metadata.map((entry) => `${entry.key} ${entry.value ?? ""}`).join(", "),
      render: (hit) => (
        <span className={styles.badges}>
          <MetadataBadges metadata={hit.metadata} onFilter={onFilterMetadata} />
          {hit.tags.length > 0 && (
            <Tooltip content={hit.tags.join(", ")}>
              <Badge tone="soft" icon="flag" tabIndex={0} data-row-interactive>
                {hit.tags.length === 1 ? hit.tags[0] : `${hit.tags.length} tags`}
              </Badge>
            </Tooltip>
          )}
        </span>
      )
    }
  ];

  return (
    <DataTable<Hit>
      label="Search results"
      columns={columns}
      groups={groups}
      getRowId={(hit) => hit.id}
      rowLabel={(hit) => hit.name}
      loading={loading}
      loadingRows={8}
      rowActions={{
        inline: [
          {
            label: "Copy secret value",
            icon: "copy",
            onSelect: copyValue,
            disabledReason: (hit) => {
              if (hit.kind !== "secret") return "Only secrets have a value to copy";
              if (hit.valueHidden) return "You do not have permission to view this secret value";
              return undefined;
            }
          }
        ]
      }}
      persistentStatus={limitNote}
      pagination={
        total > 0 ? (
          <Pagination
            page={page}
            total={total}
            pageSize={perPage}
            pageSizeOptions={PAGE_SIZES}
            onPageChange={onPageChange}
            onPageSizeChange={onPerPageChange}
          />
        ) : undefined
      }
    />
  );
}

type SearchScope = {
  projectId: string;
  query: string;
  conditions: Metadata[];
  filters: Filters;
  environmentSlugs: string[];
  secretPath: string;
  visibleKinds: SearchKind[];
  page: number;
  perPage: number;
};

const activeConditionsOf = (conditions: Condition[]) =>
  conditions
    .map((condition) => ({
      key: condition.key.trim(),
      value: condition.value.trim()
    }))
    .filter((condition) => condition.key && condition.value);

const scopeOf = (filters: Filters, environments: ProjectEnv[], metadataMode: boolean) => {
  const environmentSlugs = filters.environments.length
    ? filters.environments
    : environments.map((environment) => environment.slug);
  const folderEnvironment = environmentSlugs.length === 1 ? environmentSlugs[0] : undefined;
  const secretPath = folderEnvironment ? filters.folderPath : "/";
  const visibleKinds: SearchKind[] = metadataMode ? ["secret"] : filters.kinds;
  const activeCount =
    Number(filters.environments.length > 0) +
    Number(secretPath !== "/") +
    Number(filters.tags.length > 0) +
    Number(visibleKinds.length < ALL_KINDS.length) +
    activeConditionsOf(filters.conditions).length;
  return {
    environmentSlugs,
    folderEnvironment,
    secretPath,
    visibleKinds,
    activeCount
  };
};

const useFolderSearch = (scope: SearchScope, environments: ProjectEnv[], enabled: boolean) => {
  const adapter = useV4Adapter("secrets");
  const metadataMode = scope.conditions.length > 0;
  const quickEnabled = enabled && !metadataMode;
  const tags = Object.fromEntries(scope.filters.tags.map((slug) => [slug, true]));
  const needle = scope.query.trim().toLowerCase();
  const quick = adapter.useQuickSearch(
    {
      projectId: scope.projectId,
      secretPath: scope.secretPath,
      environments: scope.environmentSlugs,
      search: scope.query,
      tags,
      limit: scope.perPage,
      offset: (scope.page - 1) * scope.perPage
    },
    { enabled: quickEnabled }
  );
  const metadataSearch = adapter.useMetadataSearch(
    {
      projectId: scope.projectId,
      environments: scope.environmentSlugs,
      secretPath: scope.secretPath,
      operator:
        scope.filters.match === "all"
          ? SecretMetadataSearchLogicalOperator.And
          : SecretMetadataSearchLogicalOperator.Or,
      filters: scope.conditions.map((condition) => ({
        key: condition.key,
        value: condition.value ?? "",
        operator: SecretMetadataSearchOperator.Is
      })),
      tags
    },
    { enabled: metadataMode }
  );
  if (metadataMode)
    return {
      results: metadataResults(metadataSearch.data, needle, scope.page, scope.perPage),
      loading: (metadataSearch.isPending || metadataSearch.isFetching) && !metadataSearch.error,
      searchLimit: metadataSearch.data?.searchLimit,
      error: metadataSearch.error,
      retry: () => metadataSearch.refetch?.()
    };
  if (!quickEnabled) return { results: undefined, loading: false };
  return {
    results:
      quick.data &&
      quickResults(quick.data, needle, scope.visibleKinds, environments, scope.perPage),
    loading: (quick.isPending || quick.isFetching) && !quick.error,
    error: quick.error,
    retry: () => quick.refetch?.()
  };
};

function ResultsArea({
  results,
  loading,
  metadataMode,
  searchLimit,
  error,
  onRetry,
  table
}: {
  results?: Results;
  loading: boolean;
  metadataMode: boolean;
  searchLimit?: number;
  error?: unknown;
  onRetry?: () => void;
  table: Omit<Parameters<typeof ResultsTable>[0], "results" | "loading">;
}) {
  if (error && !loading)
    return (
      <EmptyState
        icon="alert"
        title="Search failed"
        description={errorMessage(error) ?? "Something went wrong. Try again."}
        actions={<Button onClick={onRetry}>Retry</Button>}
      />
    );
  if (!results && !loading)
    return (
      <EmptyState
        icon="search"
        title="Search across folders"
        description="Enter a resource name, choose a tag, or add a metadata condition."
      />
    );
  if (!loading && !results?.hits.length)
    return metadataMode ? (
      <EmptyState
        icon="search"
        title="No secrets match these conditions"
        description={`Try removing a condition or matching any. Search checks up to ${searchLimit ?? 100} candidates per metadata query.`}
      />
    ) : (
      <EmptyState
        icon="search"
        title="No matching resources"
        description="Try a different search or remove a filter."
      />
    );
  return <ResultsTable {...table} results={results ?? { hits: [], total: 0 }} loading={loading} />;
}

function SearchResults({
  orgId,
  projectId,
  environments,
  tags: tagOptions,
  folderTree,
  initialQuery,
  onSelect
}: Omit<SearchAllFoldersSheetProps, "open" | "onOpenChange">) {
  const readSecretValue = useV4Adapter("secrets").useReadSecretValue();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [paging, setPaging] = useState({ scope: "", page: 1 });
  const updateFilters = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  const live = JSON.stringify({
    query,
    conditions: activeConditionsOf(filters.conditions)
  });
  const [settled, setSettled] = useState(live);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(live), 300);
    return () => window.clearTimeout(timer);
  }, [live]);
  const debounced = JSON.parse(settled) as {
    query: string;
    conditions: Metadata[];
  };
  const metadataMode = activeConditionsOf(filters.conditions).length > 0;
  const { environmentSlugs, folderEnvironment, secretPath, visibleKinds, activeCount } = scopeOf(
    filters,
    environments,
    metadataMode
  );

  const pageScope = JSON.stringify([settled, environmentSlugs, secretPath, filters, perPage]);
  const page = paging.scope === pageScope ? paging.page : 1;
  const { results, loading, searchLimit, error, retry } = useFolderSearch(
    {
      projectId,
      query: debounced.query,
      conditions: metadataMode ? debounced.conditions : [],
      filters,
      environmentSlugs,
      secretPath,
      visibleKinds,
      page,
      perPage
    },
    environments,
    Boolean(query.trim() || filters.tags.length)
  );
  useResetPageHelper({
    totalCount: results?.total ?? Infinity,
    offset: (page - 1) * perPage,
    setPage: () => setPaging({ scope: pageScope, page: 1 })
  });

  return (
    <SheetBody className={styles.body}>
      <Input
        aria-label="Search resources"
        icon="search"
        placeholder="Search by resource name, secret metadata or tag..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.layout}>
        <SearchFilters
          environments={environments}
          tagOptions={tagOptions}
          folderTree={folderTree}
          folderEnvironment={folderEnvironment}
          filters={filters}
          activeCount={activeCount}
          shown={(kind) => visibleKinds.includes(kind)}
          onChange={updateFilters}
        />
        <div className={styles.results}>
          <ResultsArea
            results={results}
            loading={loading}
            metadataMode={metadataMode}
            searchLimit={searchLimit}
            error={error}
            onRetry={retry}
            table={{
              orgId,
              projectId,
              environments,
              page,
              perPage,
              onPageChange: (next) => setPaging({ scope: pageScope, page: next }),
              onPerPageChange: setPerPage,
              onSelect,
              onFilterMetadata: (entry) =>
                updateFilters({
                  conditions: withMetadataCondition(filters.conditions, entry)
                }),
              readSecretValue
            }}
          />
        </div>
      </div>
    </SheetBody>
  );
}

export type SearchAllFoldersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  projectId: string;
  environments: ProjectEnv[];
  tags: { slug: string }[];
  folderTree?: TProjectEnvironmentsFolders;
  initialQuery: string;
  onSelect: (selection: { path: string; search: string }) => void;
};

export function SearchAllFoldersSheet({
  open,
  onOpenChange,
  onSelect,
  ...props
}: SearchAllFoldersSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" className={styles.sheet}>
        <SheetHeader>
          <SheetTitle>Search all folders</SheetTitle>
        </SheetHeader>
        <SearchResults
          {...props}
          onSelect={(selection) => {
            onSelect(selection);
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export function ResourceSearchInput({
  value,
  disabled,
  onChange,
  onSearchAllFolders
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSearchAllFolders: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const option = useRef<HTMLButtonElement>(null);
  const trimmed = value.trim();
  return (
    <Popover open={focused && !disabled}>
      <PopoverAnchor asChild>
        <div>
          <Input
            ref={input}
            aria-label="Search resources"
            icon="search"
            placeholder="Search by secret or folder name..."
            slashShortcut
            autoComplete="off"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              if (event.relatedTarget !== option.current) setFocused(false);
            }}
            onKeyDown={(event) => {
              if (!focused) return;
              if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
                event.preventDefault();
                option.current?.focus();
              } else if (event.key === "Escape") {
                setFocused(false);
                input.current?.blur();
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        surface="menu"
        className={styles.optionMenu}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => {
          setFocused(false);
          input.current?.focus();
        }}
      >
        <Button
          ref={option}
          variant="ghost"
          size="sm"
          icon="globe"
          className={styles.option}
          onBlur={(event) => {
            if (event.relatedTarget !== input.current) setFocused(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
              event.preventDefault();
              input.current?.focus();
            }
          }}
          onClick={() => {
            setFocused(false);
            onSearchAllFolders();
          }}
        >
          <span className={styles.optionLabel}>
            {trimmed ? `Search all folders for "${trimmed}"` : "Search all folders"}
          </span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
