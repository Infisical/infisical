import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  BracesIcon,
  FingerprintIcon,
  FolderIcon,
  KeyIcon,
  RefreshCw,
  SearchIcon
} from "lucide-react";

import {
  Button,
  Combobox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  ScrollableContent,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useGetProjectSecretsQuickSearch,
  useSearchSecretsByMetadata
} from "@app/hooks/api/dashboard";
import {
  SecretMetadataSearchLogicalOperator,
  SecretMetadataSearchOperator
} from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { WsTag } from "@app/hooks/api/tags/types";
import { groupBy } from "@app/lib/fn/array";
import { ResourceCount } from "@app/pages/secret-manager/OverviewPage/components/ResourceCount";
import { type ResourceTypeOption } from "@app/pages/secret-manager/OverviewPage/components/ResourceFilter";
import { QuickSearchSecretRotationItem } from "@app/pages/secret-manager/OverviewPage/components/SecretSearchInput/components/QuickSearchSecretRotationItem";
import { RowType } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.types";

import { QuickSearchDynamicSecretItem } from "./QuickSearchDynamicSecretItem";
import { QuickSearchEnvTable } from "./QuickSearchEnvTable";
import { QuickSearchFolderItem } from "./QuickSearchFolderItem";
import { QuickSearchMetadata } from "./QuickSearchMetadataList";
import { QuickSearchMetadataSecretItem } from "./QuickSearchMetadataSecretItem";
import { QuickSearchSecretItem } from "./QuickSearchSecretItem";
import { QuickSearchSelection } from "./quickSearchTypes";
import {
  MetadataMatchType,
  MetadataSearchCondition,
  SecretMetadataSearchBuilder
} from "./SecretMetadataSearchBuilder";

export type { QuickSearchSelection } from "./quickSearchTypes";

export type QuickSearchModalProps = {
  environments: ProjectEnv[];
  projectId: string;
  tags?: WsTag[];
  isSingleEnv?: boolean;
  initialValue: string;
  onSelectResult: (selection: QuickSearchSelection) => void;
  onClose: (clearSearch?: boolean) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ResourceType =
  | RowType.Secret
  | RowType.DynamicSecret
  | RowType.Folder
  | RowType.SecretRotation;

const QUICK_SEARCH_PER_PAGE_OPTIONS = [25, 50, 100];

const QUICK_SEARCH_RESOURCE_TYPES: ResourceTypeOption[] = [
  { type: RowType.Folder, label: "Folders", icon: <FolderIcon className="text-folder" /> },
  {
    type: RowType.DynamicSecret,
    label: "Dynamic Secrets",
    icon: <FingerprintIcon className="text-dynamic-secret" />
  },
  {
    type: RowType.SecretRotation,
    label: "Secret Rotations",
    icon: <RefreshCw className="text-secret-rotation" />
  },
  { type: RowType.Secret, label: "Secrets", icon: <KeyIcon className="text-secret" /> }
];

const QUICK_SEARCH_SKELETON_ROWS = [
  { key: "row-a", name: "w-40", path: "w-72" },
  { key: "row-b", name: "w-28", path: "w-56" },
  { key: "row-c", name: "w-48", path: "w-80" },
  { key: "row-d", name: "w-36", path: "w-64" },
  { key: "row-e", name: "w-44", path: "w-72" },
  { key: "row-f", name: "w-32", path: "w-60" },
  { key: "row-g", name: "w-40", path: "w-80" },
  { key: "row-h", name: "w-28", path: "w-64" }
];

// Mirrors QuickSearchEnvTable's heading + column layout so results swap in without shifting
const QuickSearchResultsSkeleton = () => (
  <div role="status" aria-label="Loading search results">
    <div className="mb-2 flex h-5 items-center">
      <Skeleton className="h-3.5 w-28" />
    </div>
    <Table className="[&_td:first-child]:w-10 [&_td:first-child]:max-w-10 [&_td:first-child]:min-w-10 [&_td:first-child]:px-2 [&_th:first-child]:w-10 [&_th:first-child]:max-w-10 [&_th:first-child]:min-w-10 [&_th:first-child]:px-2">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead className="min-w-60">Name</TableHead>
          <TableHead className="min-w-36">Location</TableHead>
          <TableHead className="min-w-56">Metadata</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {QUICK_SEARCH_SKELETON_ROWS.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <div className="flex h-6 items-center">
                <Skeleton className="size-5" />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex h-5 items-center">
                <Skeleton className={`h-3.5 ${row.name}`} />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex h-5 items-center">
                <Skeleton className={`h-3.5 ${row.path}`} />
              </div>
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const Content = ({
  environments,
  projectId,
  onClose,
  onSelectResult,
  tags,
  initialValue = "",
  searchInputRef
}: Omit<QuickSearchModalProps, "isOpen" | "onOpenChange" | "isSingleEnv"> & {
  searchInputRef: RefObject<HTMLInputElement>;
}) => {
  const [search, setSearch] = useState(initialValue);
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(QUICK_SEARCH_PER_PAGE_OPTIONS[0]);
  const [filterTags, setFilterTags] = useState<Record<string, boolean>>({});
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>([]);
  const [folderPath, setFolderPath] = useState("");
  const [debouncedFolderPath] = useDebounce(folderPath);
  const isFolderPathPending = folderPath !== debouncedFolderPath;
  const secretPath = `/${debouncedFolderPath.trim().replace(/^\/+|\/+$/g, "")}`;
  const environmentSlugs = selectedEnvironments.length
    ? selectedEnvironments
    : environments.map((env) => env.slug);
  const [showFilter, setShowFilter] = useState<Record<ResourceType, boolean>>({
    [RowType.Secret]: false,
    [RowType.Folder]: false,
    [RowType.DynamicSecret]: false,
    [RowType.SecretRotation]: false
  });

  // Metadata search: a structured key/value condition builder backed by /secrets-by-metadata.
  // When at least one condition is complete, it "takes over" the results from the free-text search.
  const [metadataConditions, setMetadataConditions] = useState<MetadataSearchCondition[]>([]);
  const [metadataMatch, setMetadataMatch] = useState<MetadataMatchType>("all");
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const conditionIdRef = useRef(0);

  const createCondition = (): MetadataSearchCondition => {
    conditionIdRef.current += 1;
    return {
      id: `cond-${conditionIdRef.current}`,
      key: "",
      value: "",
      operator: SecretMetadataSearchOperator.Is
    };
  };

  const activeConditions = useMemo(
    () => metadataConditions.filter((condition) => condition.key.trim() && condition.value.trim()),
    [metadataConditions]
  );
  const isMetadataMode = activeConditions.length > 0;

  const [debouncedConditions] = useDebounce(activeConditions);

  const metadataFilters = useMemo(
    () =>
      debouncedConditions.map((condition) => ({
        key: condition.key.trim(),
        value: condition.value.trim(),
        operator: condition.operator
      })),
    [debouncedConditions]
  );

  const {
    data: metadataData,
    isPending: isMetadataPending,
    isFetching: isMetadataFetching
  } = useSearchSecretsByMetadata(
    {
      projectId,
      environments: environmentSlugs,
      secretPath,
      operator:
        metadataMatch === "all"
          ? SecretMetadataSearchLogicalOperator.And
          : SecretMetadataSearchLogicalOperator.Or,
      filters: metadataFilters,
      tags: filterTags
    },
    { enabled: isMetadataMode }
  );

  const isDeepSearchEnabled =
    (Boolean(search.trim()) || Object.values(filterTags).length > 0) && !isMetadataMode;

  const {
    data,
    isPending: isDeepSearchPending,
    isFetching: isDeepSearchFetching
  } = useGetProjectSecretsQuickSearch(
    {
      secretPath,
      environments: environmentSlugs,
      projectId,
      search: debouncedSearch,
      tags: filterTags,
      limit: perPage,
      offset: (page - 1) * perPage
    },
    { enabled: isDeepSearchEnabled }
  );

  const isDeepSearchLoading = isDeepSearchPending || isDeepSearchFetching || isFolderPathPending;
  const isMetadataLoading = isMetadataPending || isMetadataFetching || isFolderPathPending;

  const {
    folders = {},
    secrets = {},
    dynamicSecrets = {},
    secretRotations = {},
    totalFolderCount = 0,
    totalSecretCount = 0,
    totalDynamicSecretCount = 0,
    totalSecretRotationCount = 0,
    searchLimit = 0,
    isSearchLimitReached = false
  } = data ?? {};

  const envIdToSlug = useMemo(
    () => new Map(environments.map((env) => [env.id, env.slug])),
    [environments]
  );

  // When no resource types are checked, show all (empty filter = no filter)
  const showType = useCallback(
    (type: ResourceType) => !Object.values(showFilter).some(Boolean) || Boolean(showFilter[type]),
    [showFilter]
  );

  const resultsByEnv = useMemo(() => {
    const allFolders = Object.values(folders).flat();
    const allSecrets = Object.values(secrets).flat();
    const allDynamicSecrets = Object.values(dynamicSecrets).flat();
    const allRotations = Object.values(secretRotations).flat();

    const foldersByEnv = groupBy(
      allFolders,
      (folder) => envIdToSlug.get(folder.envId) ?? folder.envId
    );
    const secretsByEnv = groupBy(allSecrets, (secret) => secret.env);
    const dynamicSecretsByEnv = groupBy(allDynamicSecrets, (ds) => ds.environment);
    const rotationsByEnv = groupBy(allRotations, (r) => r.environment.slug);

    return environments
      .map((env) => {
        const envFolders = showType(RowType.Folder) ? (foldersByEnv[env.slug] ?? []) : [];
        const envSecrets = showType(RowType.Secret) ? (secretsByEnv[env.slug] ?? []) : [];
        const envDynamicSecrets = showType(RowType.DynamicSecret)
          ? (dynamicSecretsByEnv[env.slug] ?? [])
          : [];
        const envRotations = showType(RowType.SecretRotation)
          ? (rotationsByEnv[env.slug] ?? [])
          : [];

        const total =
          envFolders.length + envSecrets.length + envDynamicSecrets.length + envRotations.length;

        return {
          env,
          folders: envFolders,
          secrets: envSecrets,
          dynamicSecrets: envDynamicSecrets,
          secretRotations: envRotations,
          total
        };
      })
      .filter((group) => group.total > 0);
  }, [folders, secrets, dynamicSecrets, secretRotations, environments, envIdToSlug, showType]);

  // the endpoint applies one offset to each resource type independently, so the largest type sets the page count
  const visibleResultCount = Math.max(
    showType(RowType.Folder) ? totalFolderCount : 0,
    showType(RowType.Secret) ? totalSecretCount : 0,
    showType(RowType.DynamicSecret) ? totalDynamicSecretCount : 0,
    showType(RowType.SecretRotation) ? totalSecretRotationCount : 0
  );

  // the endpoint rejects an offset past its search window, so stop the pager at the last page it accepts
  const pageableResultCount = Math.min(visibleResultCount, searchLimit + perPage);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterTags, showFilter, secretPath, selectedEnvironments]);

  // a background refetch can shrink the counts and leave the current offset past the data
  useResetPageHelper({
    totalCount: pageableResultCount,
    offset: (page - 1) * perPage,
    setPage
  });

  const metadataResultsByEnv = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const filtered = (metadataData?.secrets ?? []).filter(
      (secret) =>
        !query ||
        secret.secretKey.toLowerCase().includes(query) ||
        secret.secretPath.toLowerCase().includes(query)
    );
    const secretsByEnv = groupBy(filtered, (secret) => secret.environment);
    return environments
      .map((env) => ({ env, secrets: secretsByEnv[env.slug] ?? [] }))
      .filter((group) => group.secrets.length > 0);
  }, [metadataData, environments, debouncedSearch]);

  const metadataResultCount = metadataResultsByEnv.reduce(
    (total, group) => total + group.secrets.length,
    0
  );

  // metadata search only supports secrets, so fully reset it (conditions, builder, match)
  // whenever it should no longer apply
  const resetMetadataSearch = () => {
    setMetadataConditions([]);
    setIsBuilderOpen(false);
    setMetadataMatch("all");
  };

  const handleChangeResourceTypes = (options: ResourceTypeOption[]) => {
    const selected = options.map((option) => option.type);
    if (!selected.includes(RowType.Secret)) {
      setFilterTags({});
      resetMetadataSearch();
    } else if (selected.some((type) => type !== RowType.Secret)) {
      resetMetadataSearch();
    }
    setShowFilter({
      [RowType.Secret]: selected.includes(RowType.Secret),
      [RowType.Folder]: selected.includes(RowType.Folder),
      [RowType.DynamicSecret]: selected.includes(RowType.DynamicSecret),
      [RowType.SecretRotation]: selected.includes(RowType.SecretRotation)
    });
  };

  const handleOpenMetadata = () => {
    handleChangeResourceTypes(
      QUICK_SEARCH_RESOURCE_TYPES.filter(({ type }) => type === RowType.Secret)
    );
    setIsBuilderOpen(true);
    setMetadataConditions((prev) => (prev.length ? prev : [createCondition()]));
  };

  const handleAddCondition = () => {
    setMetadataConditions((prev) => [...prev, createCondition()]);
  };

  const handleApplyMetadataFilter = (metadata: QuickSearchMetadata) => {
    const { key: metadataKey, value: metadataValue } = metadata;
    if (!metadataValue) return;

    handleChangeResourceTypes(
      QUICK_SEARCH_RESOURCE_TYPES.filter(({ type }) => type === RowType.Secret)
    );
    setIsBuilderOpen(true);
    setMetadataConditions((prev) => {
      const key = metadataKey.trim();
      const value = metadataValue.trim();
      const alreadyApplied = prev.some(
        (condition) => condition.key.trim() === key && condition.value.trim() === value
      );

      if (alreadyApplied) return prev;

      return [
        ...prev,
        {
          ...createCondition(),
          key,
          value
        }
      ];
    });
  };

  const handleUpdateCondition = (
    id: string,
    patch: Partial<Pick<MetadataSearchCondition, "key" | "value">>
  ) => {
    setMetadataConditions((prev) =>
      prev.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition))
    );
  };

  const handleRemoveCondition = (id: string) => {
    setMetadataConditions((prev) => prev.filter((condition) => condition.id !== id));
  };

  const handleClearMetadata = () => {
    setMetadataConditions([]);
  };

  // closing the builder discards the conditions so a metadata filter never stays active while hidden
  const handleCloseBuilder = () => {
    resetMetadataSearch();
  };

  const activeFilterCount =
    Number(selectedEnvironments.length > 0) +
    Number(Boolean(folderPath.trim().replace(/\//g, ""))) +
    Number(Object.keys(filterTags).length > 0) +
    Number(Object.values(showFilter).some(Boolean)) +
    activeConditions.length;

  const handleResetFilters = () => {
    setSelectedEnvironments([]);
    setFolderPath("");
    setFilterTags({});
    handleChangeResourceTypes([]);
    setPage(1);
  };

  const noResultsEmpty = (
    <Empty className="border bg-transparent shadow-none">
      <EmptyHeader>
        <EmptyTitle>No Matching Resources</EmptyTitle>
        <EmptyDescription>Try a different search or remove a filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  let resultsContent: ReactNode;
  if (isMetadataMode) {
    if (isMetadataLoading) {
      resultsContent = <QuickSearchResultsSkeleton />;
    } else if (metadataResultsByEnv.length === 0) {
      resultsContent = (
        <Empty className="border bg-transparent shadow-none">
          <EmptyHeader>
            <EmptyTitle>No secrets match these conditions.</EmptyTitle>
            <EmptyDescription>Try removing a condition or switching ALL to ANY.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    } else {
      resultsContent = (
        <div className="flex flex-col gap-6">
          {metadataResultsByEnv.map(({ env, secrets: envSecrets }) => (
            <QuickSearchEnvTable key={env.slug} envName={env.name}>
              {envSecrets.map((secret) => (
                <QuickSearchMetadataSecretItem
                  key={secret.secretId}
                  secret={secret}
                  envSlug={env.slug}
                  onClose={onClose}
                  onSelectResult={onSelectResult}
                  onApplyMetadataFilter={handleApplyMetadataFilter}
                />
              ))}
            </QuickSearchEnvTable>
          ))}
        </div>
      );
    }
  } else if (isDeepSearchEnabled) {
    if (isDeepSearchLoading) {
      resultsContent = <QuickSearchResultsSkeleton />;
    } else if (resultsByEnv.length === 0) {
      resultsContent = noResultsEmpty;
    } else {
      resultsContent = (
        <div className="flex flex-col gap-6">
          {resultsByEnv.map(
            ({
              env,
              folders: envFolders,
              secrets: envSecrets,
              dynamicSecrets: envDynamic,
              secretRotations: envRotations
            }) => (
              <QuickSearchEnvTable key={env.slug} envName={env.name}>
                {envFolders.map((folder) => (
                  <QuickSearchFolderItem
                    key={folder.id}
                    folder={folder}
                    envSlug={env.slug}
                    onClose={onClose}
                    onSelectResult={onSelectResult}
                  />
                ))}
                {envDynamic.map((ds) => (
                  <QuickSearchDynamicSecretItem
                    key={ds.id}
                    dynamicSecret={ds}
                    envSlug={env.slug}
                    onClose={onClose}
                    onSelectResult={onSelectResult}
                  />
                ))}
                {envRotations.map((rotation) => (
                  <QuickSearchSecretRotationItem
                    key={rotation.id}
                    secretRotation={rotation}
                    envSlug={env.slug}
                    onClose={onClose}
                    onSelectResult={onSelectResult}
                  />
                ))}
                {envSecrets.map((secret) => (
                  <QuickSearchSecretItem
                    key={secret.id}
                    secret={secret}
                    envSlug={env.slug}
                    search={debouncedSearch}
                    tags={Object.keys(filterTags)}
                    onClose={onClose}
                    onSelectResult={onSelectResult}
                    onApplyMetadataFilter={handleApplyMetadataFilter}
                  />
                ))}
              </QuickSearchEnvTable>
            )
          )}
        </div>
      );
    }
  } else {
    resultsContent = (
      <Empty className="border bg-transparent shadow-none">
        <EmptyHeader>
          <EmptyTitle>Search Across Folders</EmptyTitle>
          <EmptyDescription>
            Enter a resource name, select a tag, or add a metadata condition.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] gap-x-4 p-4 md:grid-rows-[auto_minmax(0,1fr)]">
      <div
        id="quick-search-filters"
        role="complementary"
        aria-label="Search filters"
        className="col-span-2 col-start-1 row-start-1 flex max-h-[45dvh] min-h-0 flex-col rounded-lg bg-card ring-1 ring-border ring-inset md:col-span-1 md:row-span-2 md:max-h-none md:w-72"
      >
        <div className="shrink-0 p-4 text-sm font-medium">Filters</div>
        <ScrollableContent
          aria-label="Filter options"
          outline={false}
          maxHeight="100%"
          containerClassName="min-h-0 flex-1"
          contentClassName="flex flex-col gap-5 p-4"
        >
          {environments.length > 1 && (
            <Field>
              <FieldLabel htmlFor="quick-search-environments">Environments</FieldLabel>
              <Combobox
                id="quick-search-environments"
                multiple
                options={environments}
                value={environments.filter((env) => selectedEnvironments.includes(env.slug))}
                onValueChange={(options) => setSelectedEnvironments(options.map((env) => env.slug))}
                getOptionValue={(env) => env.slug}
                getOptionLabel={(env) => env.name}
                placeholder="All environments"
                searchPlaceholder="Find environments..."
                searchAriaLabel="Find environments"
                clearAriaLabel="Clear environment filters"
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="quick-search-folder-path">Folder Path</FieldLabel>
            <Input
              id="quick-search-folder-path"
              className="font-mono"
              placeholder="/"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              aria-describedby="quick-search-folder-help"
            />
            <FieldDescription id="quick-search-folder-help">
              Includes subfolders. Empty searches all folders.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="quick-search-resource-types">Resource Types</FieldLabel>
            <Combobox<ResourceTypeOption>
              id="quick-search-resource-types"
              multiple
              options={QUICK_SEARCH_RESOURCE_TYPES}
              value={QUICK_SEARCH_RESOURCE_TYPES.filter(
                ({ type }) => showFilter[type as ResourceType]
              )}
              onValueChange={handleChangeResourceTypes}
              getOptionValue={(option) => option.type}
              getOptionLabel={(option) => option.label}
              renderOption={(option) => (
                <span className="flex items-center gap-2 [&_svg]:size-4">
                  {option.icon}
                  {option.label}
                </span>
              )}
              placeholder="All resource types"
              searchPlaceholder="Find resource types..."
              searchAriaLabel="Find resource types"
              clearAriaLabel="Clear resource type filters"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="quick-search-tags">Tags</FieldLabel>
            <Combobox
              id="quick-search-tags"
              multiple
              options={tags ?? []}
              value={(tags ?? []).filter((tag) => filterTags[tag.slug])}
              onValueChange={(options) => {
                setFilterTags(Object.fromEntries(options.map((tag) => [tag.slug, true])));
                if (options.length > 0) {
                  setShowFilter((previous) => ({ ...previous, [RowType.Secret]: true }));
                }
              }}
              getOptionValue={(tag) => tag.slug}
              getOptionLabel={(tag) => tag.slug}
              placeholder="Any tag"
              searchPlaceholder="Find tags..."
              searchAriaLabel="Find tags"
              clearAriaLabel="Clear tag filters"
              emptyMessage="No tags found."
            />
          </Field>
          <div className="border-t border-border pt-4">
            {isBuilderOpen ? (
              <SecretMetadataSearchBuilder
                conditions={metadataConditions}
                match={metadataMatch}
                onChangeMatch={setMetadataMatch}
                onAddCondition={handleAddCondition}
                onUpdateCondition={handleUpdateCondition}
                onRemoveCondition={handleRemoveCondition}
                onClear={handleClearMetadata}
                onClose={handleCloseBuilder}
              />
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={handleOpenMetadata}>
                <BracesIcon />
                Add Metadata Filter
              </Button>
            )}
          </div>
        </ScrollableContent>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2">
          <span className="text-xs text-accent">
            {activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"}
          </span>
          <Button variant="ghost" size="sm" onClick={handleResetFilters}>
            Reset Filters
          </Button>
        </div>
      </div>
      <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-2 py-3 md:col-span-1 md:col-start-2 md:row-start-1">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchInputRef}
            aria-label="Search resources"
            placeholder="Search by resource name, secret metadata or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>
      <div className="col-span-2 col-start-1 row-start-3 flex min-h-0 min-w-0 flex-col md:col-span-1 md:col-start-2 md:row-start-2">
        <ScrollableContent
          aria-label="Search results"
          edgeBehavior="fade"
          outline={false}
          maxHeight="100%"
          containerClassName="flex min-h-0 flex-1 flex-col"
          className="flex-1"
          contentClassName="py-4"
        >
          {resultsContent}
        </ScrollableContent>
        {isMetadataMode && (
          <div
            className="shrink-0 space-y-1 border-t border-border py-4 text-xs text-accent"
            role="status"
          >
            <p className="font-medium text-foreground">
              {isMetadataLoading
                ? "Searching..."
                : `${metadataResultCount} matching ${metadataResultCount === 1 ? "secret" : "secrets"} shown`}
            </p>
            <p>{`Search checks up to ${metadataData?.searchLimit ?? 100} candidates per metadata query. Results may be incomplete. Narrow your filters to see the rest.`}</p>
          </div>
        )}
        {isDeepSearchEnabled && !isDeepSearchLoading && visibleResultCount > 0 && (
          <div className="shrink-0 border-t border-border py-2">
            <Pagination
              startAdornment={
                <div className="flex items-center gap-3">
                  <ResourceCount
                    folderCount={showType(RowType.Folder) ? totalFolderCount : 0}
                    secretCount={showType(RowType.Secret) ? totalSecretCount : 0}
                    dynamicSecretCount={
                      showType(RowType.DynamicSecret) ? totalDynamicSecretCount : 0
                    }
                    secretRotationCount={
                      showType(RowType.SecretRotation) ? totalSecretRotationCount : 0
                    }
                  />
                  {(isSearchLimitReached || pageableResultCount < visibleResultCount) && (
                    <span className="text-xs text-accent">
                      {`Only the first ${searchLimit} matches per resource type can be reached. Narrow your search to see the rest.`}
                    </span>
                  )}
                </div>
              }
              count={pageableResultCount}
              page={page}
              perPage={perPage}
              perPageList={QUICK_SEARCH_PER_PAGE_OPTIONS}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const QuickSearchModal = ({
  isOpen,
  isSingleEnv,
  onOpenChange,
  ...props
}: QuickSearchModalProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col overflow-hidden sm:max-w-7xl"
        onEscapeKeyDown={(event) => {
          if (
            searchInputRef.current
              ?.closest('[data-slot="sheet-content"]')
              ?.querySelector('[role="combobox"][aria-expanded="true"]')
          ) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = searchInputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }}
        onPointerDownOutside={(event) => {
          if ((event.target as HTMLElement).closest('[data-slot="hover-card-content"]')) {
            event.preventDefault();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>{`Search All Folders${isSingleEnv ? " In Environment" : ""}`}</SheetTitle>
          <SheetDescription>
            {`Find resources across folders in ${isSingleEnv ? "this environment" : "your project"}.`}
          </SheetDescription>
        </SheetHeader>
        <Content {...props} searchInputRef={searchInputRef} />
      </SheetContent>
    </Sheet>
  );
};
