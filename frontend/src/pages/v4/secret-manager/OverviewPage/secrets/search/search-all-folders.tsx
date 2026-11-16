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
  SecretMetadataSearchLogicalOperator,
  SecretMetadataSearchOperator
} from "@app/hooks/api/dashboard/types";
import type { ProjectEnv } from "@app/hooks/api/projects/types";
import type { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";

import { failed, toast } from "../../../../access/toast";
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

const KINDS: { kind: SearchKind; label: string; filterBy?: string }[] = [
  { kind: "folder", label: "Folders" },
  { kind: "dynamic", label: "Dynamic secrets", filterBy: "dynamic" },
  { kind: "rotation", label: "Secret rotations", filterBy: "rotation" },
  { kind: "secret", label: "Secrets", filterBy: "secret" }
];
const ALL_KINDS = KINDS.map((entry) => entry.kind);

const includesText = (text: string, needle: string) =>
  Boolean(needle) && text.toLowerCase().includes(needle);

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

function SearchResults({
  orgId,
  projectId,
  environments,
  tags: tagOptions,
  folderTree,
  initialQuery,
  onSelect
}: Omit<SearchAllFoldersSheetProps, "open" | "onOpenChange">) {
  const adapter = useV4Adapter("secrets");
  const readSecretValue = adapter.useReadSecretValue();
  const [query, setQuery] = useState(initialQuery);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>([]);
  const [folderPath, setFolderPath] = useState("/");
  const [kinds, setKinds] = useState<SearchKind[]>(ALL_KINDS);
  const [tags, setTags] = useState<string[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([{ id: 1, key: "", value: "" }]);
  const [match, setMatch] = useState<"all" | "any">("all");
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [paging, setPaging] = useState({ scope: "", page: 1 });
  const nextCondition = useRef(1);

  const activeConditions = conditions
    .map((condition) => ({ key: condition.key.trim(), value: condition.value.trim() }))
    .filter((condition) => condition.key && condition.value);
  const metadataMode = activeConditions.length > 0;
  const live = JSON.stringify({ query, activeConditions });
  const [settled, setSettled] = useState(live);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(live), 300);
    return () => window.clearTimeout(timer);
  }, [live]);
  const debounced = JSON.parse(settled) as {
    query: string;
    activeConditions: { key: string; value: string }[];
  };
  const needle = debounced.query.trim().toLowerCase();

  const environmentSlugs = selectedEnvironments.length
    ? selectedEnvironments
    : environments.map((environment) => environment.slug);
  const folderEnvironment = environmentSlugs.length === 1 ? environmentSlugs[0] : undefined;
  const secretPath = folderEnvironment ? folderPath : "/";
  const tagFilter = Object.fromEntries(tags.map((slug) => [slug, true]));
  const shown = (kind: SearchKind) => (metadataMode ? kind === "secret" : kinds.includes(kind));

  const scope = JSON.stringify([
    settled,
    environmentSlugs,
    secretPath,
    tags,
    kinds,
    match,
    perPage
  ]);
  const page = paging.scope === scope ? paging.page : 1;
  const setPage = (next: number) => setPaging({ scope, page: next });

  const quickEnabled = Boolean(query.trim() || tags.length) && !metadataMode;
  const quick = adapter.useQuickSearch(
    {
      projectId,
      secretPath,
      environments: environmentSlugs,
      search: debounced.query,
      tags: tagFilter,
      limit: perPage,
      offset: (page - 1) * perPage
    },
    { enabled: quickEnabled }
  );
  const metadataSearch = adapter.useMetadataSearch(
    {
      projectId,
      environments: environmentSlugs,
      secretPath,
      operator:
        match === "all"
          ? SecretMetadataSearchLogicalOperator.And
          : SecretMetadataSearchLogicalOperator.Or,
      filters: debounced.activeConditions.map((condition) => ({
        ...condition,
        operator: SecretMetadataSearchOperator.Is
      })),
      tags: tagFilter
    },
    { enabled: metadataMode }
  );

  const environmentById = new Map(environments.map((environment) => [environment.id, environment]));

  let hits: Hit[] = [];
  let total = 0;
  let limitNote: string | undefined;
  if (metadataMode) {
    const matches = (metadataSearch.data?.secrets ?? [])
      .filter(
        (secret) =>
          !needle ||
          includesText(secret.secretKey, needle) ||
          includesText(secret.secretPath, needle)
      )
      .sort(
        (a, b) => a.secretKey.localeCompare(b.secretKey) || a.secretPath.localeCompare(b.secretPath)
      );
    total = matches.length;
    hits = matches.slice((page - 1) * perPage, page * perPage).map((secret) => ({
      id: secret.secretId,
      kind: "secret",
      name: secret.secretKey,
      environment: secret.environment,
      location: secret.secretPath,
      metadata: secret.metadata,
      tags: secret.tags.map((tag) => tag.slug),
      valueHidden: secret.secretValueHidden
    }));
    if (total)
      limitNote = `Checks up to ${metadataSearch.data?.searchLimit ?? 100} candidates per metadata query. Narrow your filters to see the rest.`;
  } else if (quickEnabled && quick.data) {
    const { data } = quick;
    const folders = shown("folder") ? Object.values(data.folders).flat() : [];
    const secrets = shown("secret") ? Object.values(data.secrets).flat() : [];
    const dynamicSecrets = shown("dynamic") ? Object.values(data.dynamicSecrets).flat() : [];
    const rotations = shown("rotation") ? Object.values(data.secretRotations).flat() : [];
    const plain = { metadata: [], tags: [], valueHidden: true };
    hits = [
      ...folders.map((folder): Hit => ({
        ...plain,
        id: `folder:${folder.id}`,
        kind: "folder",
        name: folder.name,
        environment: environmentById.get(folder.envId)?.slug ?? folder.envId,
        location: folder.path
      })),
      ...dynamicSecrets.map((entry): Hit => ({
        ...plain,
        id: `dynamic:${entry.id}`,
        kind: "dynamic",
        name: entry.name,
        environment: entry.environment,
        location: entry.path
      })),
      ...rotations.map((entry): Hit => ({
        ...plain,
        id: `rotation:${entry.id}`,
        kind: "rotation",
        name: entry.name,
        environment: entry.environment.slug,
        location: entry.folder.path
      })),
      ...secrets.map((secret): Hit => {
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
          metadata: (secret.secretMetadata ?? []).map(({ key, value }) => ({ key, value })),
          tags: (secret.tags ?? []).map((tag) => tag.slug),
          valueHidden: secret.secretValueHidden,
          matched
        };
      })
    ];
    const visible = Math.max(
      shown("folder") ? data.totalFolderCount : 0,
      shown("secret") ? data.totalSecretCount : 0,
      shown("dynamic") ? data.totalDynamicSecretCount : 0,
      shown("rotation") ? data.totalSecretRotationCount : 0
    );
    total = Math.min(visible, data.searchLimit + perPage);
    if (data.isSearchLimitReached || total < visible)
      limitNote = `Only the first ${data.searchLimit} matches per resource type can be reached. Narrow your search to see the rest.`;
  }

  const loading = metadataMode
    ? metadataSearch.isPending || metadataSearch.isFetching
    : quickEnabled && (quick.isPending || quick.isFetching);

  const groups = environments
    .map((environment) => ({
      id: environment.slug,
      label: environment.name,
      meta: String(hits.filter((hit) => hit.environment === environment.slug).length),
      rows: hits.filter((hit) => hit.environment === environment.slug)
    }))
    .filter((group) => group.rows.length);

  const filterOnMetadata = ({ key, value }: Metadata) => {
    if (!value) return;
    setConditions((current) => {
      if (current.some((entry) => entry.key.trim() === key && entry.value.trim() === value))
        return current;
      const blank = current.find((entry) => !entry.key.trim() && !entry.value.trim());
      if (blank)
        return current.map((entry) => (entry.id === blank.id ? { ...entry, key, value } : entry));
      nextCondition.current += 1;
      return [...current, { id: nextCondition.current, key, value }];
    });
  };
  const resetMetadata = () => {
    nextCondition.current += 1;
    setConditions([{ id: nextCondition.current, key: "", value: "" }]);
    setMatch("all");
  };
  const toggleKind = (kind: SearchKind, checked: boolean) => {
    const next = checked ? [...kinds, kind] : kinds.filter((entry) => entry !== kind);
    if (!next.includes("secret")) setTags([]);
    if (!next.includes("secret") || next.some((entry) => entry !== "secret")) resetMetadata();
    setKinds(next);
  };
  const resetFilters = () => {
    setSelectedEnvironments([]);
    setFolderPath("/");
    setTags([]);
    setKinds(ALL_KINDS);
    resetMetadata();
  };
  const updateCondition = (id: number, patch: Partial<Condition>) =>
    setConditions((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
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
      mono: true,
      minWidth: 240,
      text: (hit) => hit.name,
      render: (hit) => (
        <span className={styles.name}>
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
          <MetadataBadges metadata={hit.metadata} onFilter={filterOnMetadata} />
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

  const activeFilters =
    Number(selectedEnvironments.length > 0) +
    Number(secretPath !== "/") +
    Number(tags.length > 0) +
    Number(ALL_KINDS.some((kind) => !shown(kind))) +
    activeConditions.length;

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

  let results;
  if (!metadataMode && !quickEnabled)
    results = (
      <EmptyState
        icon="search"
        title="Search across folders"
        description="Enter a resource name, choose a tag, or add a metadata condition."
      />
    );
  else if (!loading && !groups.length)
    results = metadataMode ? (
      <EmptyState
        icon="search"
        title="No secrets match these conditions"
        description={`Try removing a condition or matching any. Search checks up to ${metadataSearch.data?.searchLimit ?? 100} candidates per metadata query.`}
      />
    ) : (
      <EmptyState
        icon="search"
        title="No matching resources"
        description="Try a different search or remove a filter."
      />
    );
  else
    results = (
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
              onPageChange={setPage}
              onPageSizeChange={setPerPage}
            />
          ) : undefined
        }
      />
    );

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
        <Card
          variant="framed"
          size="sm"
          title="Filters"
          badges={activeFilters > 0 ? <Count>{activeFilters}</Count> : undefined}
          action={
            <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!activeFilters}>
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
                  value={selectedEnvironments}
                  onChange={(value) => {
                    setSelectedEnvironments(value);
                    setFolderPath("/");
                  }}
                  clearable
                />
              </Field>
            )}
            <Field
              label="Folder"
              description={
                folderEnvironment ? undefined : "Select one environment to choose a folder."
              }
            >
              <Combobox
                key={folderEnvironment ?? "all"}
                label="Folder"
                placeholder="All folders"
                options={folderOptions}
                value={folderPath === "/" ? "" : folderPath}
                onChange={(value) => setFolderPath(value || "/")}
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
                options={tagOptions.map((tag) => ({ value: tag.slug, label: tag.slug }))}
                value={tags}
                onChange={(value) => {
                  setTags(value);
                  if (value.length && !kinds.includes("secret")) setKinds([...kinds, "secret"]);
                }}
                emptyText="No tags found."
                clearable
              />
            </Field>
            <FieldSet
              legend="Metadata"
              legendVariant="label"
              actions={
                <ToggleGroup
                  type="single"
                  size="sm"
                  aria-label="Match metadata conditions"
                  value={match}
                  onValueChange={(value) => value && setMatch(value as "all" | "any")}
                >
                  <ToggleGroupItem value="all">All</ToggleGroupItem>
                  <ToggleGroupItem value="any">Any</ToggleGroupItem>
                </ToggleGroup>
              }
            >
              <div className={styles.conditions}>
                {conditions.map((condition, index) => (
                  <div key={condition.id} className={styles.condition}>
                    {index > 0 && (
                      <span className={styles.joiner}>{match === "all" ? "and" : "or"}</span>
                    )}
                    <div className={styles.conditionFields}>
                      <Input
                        mono
                        aria-label={`Metadata key ${index + 1}`}
                        placeholder="Key"
                        value={condition.key}
                        onChange={(event) =>
                          updateCondition(condition.id, { key: event.target.value })
                        }
                      />
                      <span className={styles.operator}>is</span>
                      <Input
                        mono
                        aria-label={`Metadata value ${index + 1}`}
                        placeholder="Value"
                        value={condition.value}
                        onChange={(event) =>
                          updateCondition(condition.id, { value: event.target.value })
                        }
                      />
                      {index > 0 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          icon="x"
                          iconOnly
                          aria-label={`Remove condition ${index + 1}`}
                          onClick={() =>
                            setConditions((current) =>
                              current.filter((entry) => entry.id !== condition.id)
                            )
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
                    onClick={() => {
                      nextCondition.current += 1;
                      setConditions((current) => [
                        ...current,
                        { id: nextCondition.current, key: "", value: "" }
                      ]);
                    }}
                  >
                    Add condition
                  </Button>
                </span>
              </div>
            </FieldSet>
          </div>
        </Card>
        <div className={styles.results}>{results}</div>
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
