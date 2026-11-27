import { Fragment, useMemo, useState } from "react";
import {
  BanIcon,
  BookOpenTextIcon,
  BoxesIcon,
  CheckIcon,
  InfoIcon,
  PackageIcon,
  PlusIcon,
  XIcon
} from "lucide-react";

import { nativeTargetText } from "@app/components/agent-vault/nativeServiceMeta";
import {
  displayHostPattern,
  hostPatternOf,
  isNativeService,
  SERVICE_TYPE_LABELS
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useDebounce } from "@app/hooks";
import {
  AgentVaultServiceType,
  useListAgentVaultAccessBundles,
  useListAgentVaultServices,
  useListAgentVaultSkills
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import {
  useAgentVaultAccessBundleCatalog,
  useAgentVaultServiceCatalog,
  useAgentVaultSkillCatalog
} from "@app/hooks/api/agentVaultRoles";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ActionRows, ExpandToggle } from "./ActionRows";
import {
  addResourceItems,
  CUSTOM_LEVEL,
  DENIED_LEVEL,
  getActionState,
  getEffectiveAllow,
  getItemLevel,
  getPermissionRow,
  getRowLevel,
  getRowWarnings,
  isItemRedundant,
  NONE_LEVEL,
  removeResourceItem,
  RESOURCE_NOUNS,
  setActionAllowed,
  setItemLevel,
  setRowLevel,
  TAgentVaultPolicy,
  TPolicyKind,
  TResourceRowKey
} from "./agentVaultPolicyModel";
import { LevelSelect, TLevelOption } from "./LevelSelect";

const PICKER_LIMIT = 100;
const CREATE_KEY = "create";
// Creating new ones counts as part of Full Control over every one of them, the only level that holds it.
const FULL_CONTROL_LEVEL = "manage";
const ALL_OPTION = "all";
// The width of the expand toggle and the icon before a name, with their gaps, so actions line up under the name.
const ITEM_NAME_INDENT = "pl-15";
// Every one of them starts at Use when added from the picker, as a picked item does.
const ADDED_ALL_LEVEL = "use";

export type TPolicyResourceItem = {
  id: string;
  name: string;
  description: string | null;
  service?: TAgentVaultService;
};

const LEVEL_DESCRIPTIONS: Record<TResourceRowKey, Record<string, string>> = {
  accessBundles: {
    [NONE_LEVEL]: "Only the access bundles picked below",
    view: "See it and what it holds",
    use: "Start sessions from it, with every service and skill in it",
    edit: "Also change what it holds, adding only services and skills they can use",
    manage: "Also delete it",
    [DENIED_LEVEL]: "Overrides every other role"
  },
  services: {
    [NONE_LEVEL]: "Only the services picked below",
    view: "See it and its settings",
    use: "Put it in a session",
    edit: "Also change it, including where it sends its credential",
    manage: "Also delete it",
    [DENIED_LEVEL]: "Overrides other roles, though an access bundle that holds it still gives it"
  },
  skills: {
    [NONE_LEVEL]: "Only the skills picked below",
    view: "See it and its files",
    use: "Put it in a session",
    edit: "Also change its files",
    manage: "Also delete it",
    [DENIED_LEVEL]: "Overrides other roles, though an access bundle that holds it still gives it"
  }
};

const DOCS_URLS: Record<TResourceRowKey, string> = {
  accessBundles: AgentVaultDocsUrls.accessBundles,
  services: AgentVaultDocsUrls.services,
  skills: AgentVaultDocsUrls.skills
};

const serviceTargetsOf = (service: TAgentVaultService) => {
  if (isNativeService(service)) return [nativeTargetText(service)];
  if (service.type === AgentVaultServiceType.Mcp) return [service.serverUrl];
  return displayHostPattern(service.hostPattern).split(", ");
};

// A service's type and where it connects, kept out of the table so the name and access columns have the room.
const ServiceDetailsHoverCard = ({
  service,
  name
}: {
  service: TAgentVaultService;
  name: string;
}) => {
  const targets = serviceTargetsOf(service);
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`Details of ${name}`}
          className="inline-flex shrink-0 rounded-sm text-muted outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <InfoIcon className="size-3" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-auto max-w-96">
        <DetailGroup>
          <Detail>
            <DetailLabel>Type</DetailLabel>
            <DetailValue>{SERVICE_TYPE_LABELS[service.type]}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>{targets.length === 1 ? "Target" : "Targets"}</DetailLabel>
            <DetailValue>
              {targets.map((target) => (
                <div key={target}>{target}</div>
              ))}
            </DetailValue>
          </Detail>
        </DetailGroup>
      </HoverCardContent>
    </HoverCard>
  );
};

const COLUMN_LABELS: Record<TResourceRowKey, string> = {
  accessBundles: "Access Bundle",
  services: "Service",
  skills: "Skill"
};

// The open state of each scope's actions is held by the editor, keyed by row and by bundle, service or skill.
const allScopeKey = (rowKey: TResourceRowKey) => `${rowKey}:all`;
const itemScopeKey = (rowKey: TResourceRowKey, itemId: string) => `${rowKey}:${itemId}`;

type TViewProps = {
  rowKey: TResourceRowKey;
  noun: TPolicyKind;
  policy: TAgentVaultPolicy;
  onChange: (policy: TAgentVaultPolicy) => void;
  isReadOnly: boolean;
  isScopeOpen: (scopeKey: string) => boolean;
  onScopeOpenChange: (scopeKey: string, isOpen: boolean) => void;
  isScopeCollapsed: (scopeKey: string) => boolean;
  onScopeCollapsedChange: (scopeKey: string, isCollapsed: boolean) => void;
  // Takes the card off the role, with everything it grants. Left out where the role can't be edited.
  onRemove?: () => void;
  itemsById: Map<string, TPolicyResourceItem>;
  isCatalogPending: boolean;
  // The catalog stops loading past a set number of rows, so an item it lacks may simply not be loaded.
  isCatalogCutShort: boolean;
  searchResults: TPolicyResourceItem[];
  isSearching: boolean;
  hasMoreResults: boolean;
  onSearchChange: (search: string) => void;
};

const ItemIcon = ({ item, rowKey }: { item?: TPolicyResourceItem; rowKey: TResourceRowKey }) => {
  if (rowKey === "accessBundles") return <PackageIcon className="size-4 shrink-0 text-muted" />;
  if (rowKey === "skills") return <BookOpenTextIcon className="size-4 shrink-0 text-muted" />;
  if (!item?.service) return <BoxesIcon className="size-4 shrink-0 text-muted" />;
  return <ServiceIcon hostPattern={hostPatternOf(item.service)} serviceType={item.service.type} />;
};

type TAddPopoverProps = {
  rowKey: TResourceRowKey;
  isAllAdded: boolean;
  addedIds: Set<string>;
  searchResults: TPolicyResourceItem[];
  isSearching: boolean;
  hasMoreResults: boolean;
  onSearchChange: (search: string) => void;
  // Checking an entry adds it to the role and unchecking takes it off, as Add Policies does.
  onToggleAll: (isAdded: boolean) => void;
  onToggleItem: (itemId: string, isAdded: boolean) => void;
};

// Holds its place when hidden, so names don't shift as entries are checked.
const AddedCheck = ({ isAdded }: { isAdded: boolean }) => (
  <CheckIcon className={cn("ml-auto text-foreground", isAdded ? "opacity-100" : "opacity-0")} />
);

const AddResourcesPopover = ({
  rowKey,
  isAllAdded,
  addedIds,
  searchResults,
  isSearching,
  hasMoreResults,
  onSearchChange,
  onToggleAll,
  onToggleItem
}: TAddPopoverProps) => {
  const { label, plural } = RESOURCE_NOUNS[rowKey];
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const changeSearch = (value: string) => {
    setSearch(value);
    onSearchChange(value);
  };
  const isAllListed = !search.trim();

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) changeSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          Add {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={changeSearch}
            placeholder={`Search ${plural}...`}
            aria-label={`Search ${plural}`}
          />
          {/* The editor can sit in a sheet, whose scroll lock would otherwise swallow the wheel over this portaled list */}
          <CommandList className="overscroll-contain" onWheel={(event) => event.stopPropagation()}>
            {!isSearching && !isAllListed && (
              <CommandEmpty>No {plural} match that search</CommandEmpty>
            )}
            {isAllListed && (
              <CommandGroup>
                <CommandItem value={ALL_OPTION} onSelect={() => onToggleAll(!isAllAdded)}>
                  <BoxesIcon className="text-muted" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">All {label}</span>
                    <span className="truncate text-xs text-muted">Including ones added later</span>
                  </div>
                  <AddedCheck isAdded={isAllAdded} />
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {searchResults.map((option) => {
                const isAdded = addedIds.has(option.id);
                return (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => onToggleItem(option.id, !isAdded)}
                  >
                    <ItemIcon item={option} rowKey={rowKey} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{option.name}</span>
                      {option.description && (
                        <span className="truncate text-xs text-muted">{option.description}</span>
                      )}
                    </div>
                    <AddedCheck isAdded={isAdded} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {hasMoreResults && (
            <div className="border-t border-border px-3 py-2 text-xs text-muted">
              Search by name to find {plural} that aren&apos;t listed.
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ResourceAccessCardView = ({
  rowKey,
  noun,
  policy,
  onChange,
  isReadOnly,
  isScopeOpen,
  onScopeOpenChange,
  isScopeCollapsed,
  onScopeCollapsedChange,
  onRemove,
  itemsById,
  isCatalogPending,
  isCatalogCutShort,
  searchResults,
  isSearching,
  hasMoreResults,
  onSearchChange
}: TViewProps) => {
  const row = getPermissionRow(rowKey);
  const { label, singular, plural } = RESOURCE_NOUNS[rowKey];
  const resource = policy[rowKey];
  // Every one of them shows once the role holds a rule for all of them, or once it's added from the picker.
  const [isAllAdded, setIsAllAdded] = useState(false);

  const addedIds = new Set(resource.items.map((item) => item.id));
  const nameOf = (itemId: string) => itemsById.get(itemId)?.name ?? itemId;
  const items = [...resource.items].sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
  const warnings = getRowWarnings(policy, rowKey, noun);
  const allWarning = warnings
    .filter(({ itemId }) => !itemId)
    .map(({ message }) => message)
    .join(" ");
  const inherited = getEffectiveAllow(policy, { rowKey }).filter((key) => key !== CREATE_KEY);
  const createState = getActionState(policy, { rowKey }, CREATE_KEY);
  const canCreate = createState.isAllowed && !createState.isDenied;

  // Create isn't a level of its own: Full Control holds it, and anything else with it, or Full Control without it, is
  // custom.
  const rowLevel = getRowLevel(policy, rowKey);
  const allLevel = canCreate === (rowLevel === FULL_CONTROL_LEVEL) ? rowLevel : CUSTOM_LEVEL;
  const isAllCustom = allLevel === CUSTOM_LEVEL || isScopeOpen(allScopeKey(rowKey));
  const isAllExpanded = isAllCustom && !isScopeCollapsed(allScopeKey(rowKey));
  const isAllShown =
    isAllAdded || isAllCustom || resource.allow.length > 0 || resource.deny.length > 0;
  const allOptions: TLevelOption[] = row.levels
    .filter((level) => level.value !== NONE_LEVEL)
    .map((level) => ({
      value: level.value,
      label: level.label,
      description:
        level.value === FULL_CONTROL_LEVEL
          ? `Also delete it, and create new ${plural}`
          : LEVEL_DESCRIPTIONS[rowKey][level.value]
    }));
  const setAllLevel = (next: TAgentVaultPolicy, level: string) =>
    setActionAllowed(
      setRowLevel(next, rowKey, level),
      { rowKey },
      CREATE_KEY,
      level === FULL_CONTROL_LEVEL
    );
  const itemOptions: TLevelOption[] = [
    ...row.levels
      .filter((level) => level.value !== NONE_LEVEL)
      .map((level) => {
        const isCovered = level.allow.every((key) => inherited.includes(key));
        return {
          value: level.value,
          label: level.label,
          description: isCovered
            ? `Every ${singular} already has this`
            : LEVEL_DESCRIPTIONS[rowKey][level.value],
          isDisabled: isCovered
        };
      }),
    {
      value: DENIED_LEVEL,
      label: (
        <span className="flex items-center gap-1.5">
          <BanIcon className="text-danger" />
          Denied
        </span>
      ),
      description: LEVEL_DESCRIPTIONS[rowKey][DENIED_LEVEL],
      hasSeparatorBefore: true
    }
  ];

  const removeAll = () => {
    setIsAllAdded(false);
    onScopeOpenChange(allScopeKey(rowKey), false);
    onChange(setAllLevel(policy, NONE_LEVEL));
  };
  const toggleAll = (isAdded: boolean) => {
    if (!isAdded) {
      removeAll();
      return;
    }
    setIsAllAdded(true);
    onChange(setAllLevel(policy, ADDED_ALL_LEVEL));
  };
  const toggleItem = (itemId: string, isAdded: boolean) => {
    if (isAdded) {
      onChange(addResourceItems(policy, rowKey, [itemId]));
      return;
    }
    onScopeOpenChange(itemScopeKey(rowKey, itemId), false);
    onChange(removeResourceItem(policy, rowKey, itemId));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {label}
          <DocumentationLinkBadge href={DOCS_URLS[rowKey]} />
        </CardTitle>
        <CardDescription>{row.description}</CardDescription>
        {!isReadOnly && (
          <CardAction className="flex items-center gap-1">
            <AddResourcesPopover
              rowKey={rowKey}
              isAllAdded={isAllShown}
              addedIds={addedIds}
              searchResults={searchResults}
              isSearching={isSearching}
              hasMoreResults={hasMoreResults}
              onSearchChange={onSearchChange}
              onToggleAll={toggleAll}
              onToggleItem={toggleItem}
            />
            {onRemove && (
              <IconButton
                variant="ghost"
                size="sm"
                aria-label={`Remove ${label}`}
                onClick={onRemove}
              >
                <XIcon />
              </IconButton>
            )}
          </CardAction>
        )}
      </CardHeader>

      {!isAllShown && !items.length ? (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No {plural}</EmptyTitle>
              <EmptyDescription>This role has no access to {plural}.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead isTruncatable className="w-full">
                {COLUMN_LABELS[rowKey]}
              </TableHead>
              <TableHead>Access</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isAllShown && (
              <TableRow>
                <TableCell isTruncatable className="min-w-56">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ExpandToggle
                      isVisible={isAllCustom}
                      isExpanded={isAllExpanded}
                      label={`all ${plural}`}
                      onToggle={() => onScopeCollapsedChange(allScopeKey(rowKey), isAllExpanded)}
                    />
                    <BoxesIcon className="size-4 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <div className="truncate">All {label}</div>
                      {allWarning ? (
                        <div className="truncate text-xs leading-4 text-warning" title={allWarning}>
                          {allWarning}
                        </div>
                      ) : (
                        <div className="truncate text-xs leading-4 text-muted">
                          Including ones added later
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <LevelSelect
                    value={isAllCustom ? CUSTOM_LEVEL : allLevel}
                    placeholder="No Access"
                    options={allOptions}
                    ariaLabel={`Access to all ${plural}`}
                    isDisabled={isReadOnly}
                    onLevelChange={(level) => {
                      onScopeOpenChange(allScopeKey(rowKey), false);
                      onChange(setAllLevel(policy, level));
                    }}
                    onCustom={() => onScopeOpenChange(allScopeKey(rowKey), true)}
                  />
                </TableCell>
                <TableCell variant="action">
                  {!isReadOnly && (
                    <IconButton
                      variant="ghost"
                      size="xs"
                      aria-label={`Remove all ${plural}`}
                      onClick={removeAll}
                    >
                      <XIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            )}
            {isAllShown && isAllExpanded && (
              <ActionRows
                policy={policy}
                scope={{ rowKey }}
                scopeLabel={`all ${plural}`}
                isReadOnly={isReadOnly}
                onChange={onChange}
                hasTrailingCell
                indentClassName={ITEM_NAME_INDENT}
              />
            )}
            {items.map((item) => {
              const known = itemsById.get(item.id);
              const name = nameOf(item.id);
              const level = getItemLevel(policy, rowKey, item.id);
              const scopeKey = itemScopeKey(rowKey, item.id);
              const isCustom = level === CUSTOM_LEVEL || isScopeOpen(scopeKey);
              const isExpanded = isCustom && !isScopeCollapsed(scopeKey);
              const warning = warnings.find(({ itemId }) => itemId === item.id)?.message;
              let subtitle: string | null = known?.description || null;
              if (!known && !isCatalogPending) {
                subtitle = isCatalogCutShort
                  ? `Not loaded, since the project has more ${plural} than this page lists`
                  : `Deleted ${singular}, or one you can't see`;
              }
              if (isItemRedundant(policy, rowKey, item.id))
                subtitle = `Already covered by All ${label}`;

              return (
                <Fragment key={item.id}>
                  <TableRow>
                    <TableCell isTruncatable className="min-w-56">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ExpandToggle
                          isVisible={isCustom}
                          isExpanded={isExpanded}
                          label={name}
                          onToggle={() => onScopeCollapsedChange(scopeKey, isExpanded)}
                        />
                        <ItemIcon item={known} rowKey={rowKey} />
                        <div className="min-w-0">
                          {!known && isCatalogPending ? (
                            <Skeleton className="h-4 w-28" />
                          ) : (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={known ? "truncate" : "truncate font-mono text-xs"}
                                title={name}
                              >
                                {name}
                              </span>
                              {known?.service && (
                                <ServiceDetailsHoverCard service={known.service} name={name} />
                              )}
                            </div>
                          )}
                          {warning ? (
                            <div
                              className="truncate text-xs leading-4 text-warning"
                              title={warning}
                            >
                              {warning}
                            </div>
                          ) : (
                            subtitle && (
                              <div
                                className="truncate text-xs leading-4 text-muted"
                                title={subtitle}
                              >
                                {subtitle}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <LevelSelect
                        value={isCustom ? CUSTOM_LEVEL : level}
                        placeholder="No Access"
                        options={itemOptions}
                        ariaLabel={`Access to ${name}`}
                        isDisabled={isReadOnly}
                        onLevelChange={(next) => {
                          onScopeOpenChange(scopeKey, false);
                          onChange(setItemLevel(policy, rowKey, item.id, next));
                        }}
                        onCustom={() => onScopeOpenChange(scopeKey, true)}
                      />
                    </TableCell>
                    <TableCell variant="action">
                      {!isReadOnly && (
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={`Remove ${name}`}
                          onClick={() => {
                            onScopeOpenChange(scopeKey, false);
                            onChange(removeResourceItem(policy, rowKey, item.id));
                          }}
                        >
                          <XIcon />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <ActionRows
                      policy={policy}
                      scope={{ rowKey, itemId: item.id }}
                      scopeLabel={name}
                      isReadOnly={isReadOnly}
                      onChange={onChange}
                      hasTrailingCell
                      indentClassName={ITEM_NAME_INDENT}
                    />
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};

type TCardProps = Omit<
  TViewProps,
  | "rowKey"
  | "itemsById"
  | "isCatalogPending"
  | "isCatalogCutShort"
  | "searchResults"
  | "isSearching"
  | "hasMoreResults"
  | "onSearchChange"
> & { projectId: string };

const toServiceItem = (service: TAgentVaultService): TPolicyResourceItem => ({
  id: service.id,
  name: service.name,
  description: service.description,
  service
});

export const AccessBundlesAccessCard = ({ projectId, isReadOnly, ...props }: TCardProps) => {
  const catalog = useAgentVaultAccessBundleCatalog(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const results = useListAgentVaultAccessBundles(
    projectId,
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    { enabled: !isReadOnly }
  );

  const itemsById = useMemo(
    () =>
      new Map(
        (catalog.data?.items ?? []).map((bundle) => [
          bundle.id,
          { id: bundle.id, name: bundle.name, description: bundle.description ?? null }
        ])
      ),
    [catalog.data]
  );
  const searchResults = useMemo(
    () =>
      (results.data?.accessBundles ?? []).map((bundle) => ({
        id: bundle.id,
        name: bundle.name,
        description: bundle.description ?? null
      })),
    [results.data]
  );

  return (
    <ResourceAccessCardView
      {...props}
      rowKey="accessBundles"
      isReadOnly={isReadOnly}
      itemsById={itemsById}
      isCatalogPending={catalog.isPending}
      isCatalogCutShort={(catalog.data?.items.length ?? 0) < (catalog.data?.totalCount ?? 0)}
      searchResults={searchResults}
      isSearching={results.isFetching || search !== debouncedSearch}
      hasMoreResults={(results.data?.totalCount ?? 0) > searchResults.length}
      onSearchChange={setSearch}
    />
  );
};

export const ServicesAccessCard = ({ projectId, isReadOnly, ...props }: TCardProps) => {
  const catalog = useAgentVaultServiceCatalog(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const results = useListAgentVaultServices(
    projectId,
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    { enabled: !isReadOnly }
  );

  const itemsById = useMemo(
    () =>
      new Map((catalog.data?.items ?? []).map((service) => [service.id, toServiceItem(service)])),
    [catalog.data]
  );
  const searchResults = useMemo(
    () => (results.data?.services ?? []).map(toServiceItem),
    [results.data]
  );

  return (
    <ResourceAccessCardView
      {...props}
      rowKey="services"
      isReadOnly={isReadOnly}
      itemsById={itemsById}
      isCatalogPending={catalog.isPending}
      isCatalogCutShort={(catalog.data?.items.length ?? 0) < (catalog.data?.totalCount ?? 0)}
      searchResults={searchResults}
      isSearching={results.isFetching || search !== debouncedSearch}
      hasMoreResults={(results.data?.totalCount ?? 0) > searchResults.length}
      onSearchChange={setSearch}
    />
  );
};

export const SkillsAccessCard = ({ projectId, isReadOnly, ...props }: TCardProps) => {
  const catalog = useAgentVaultSkillCatalog(projectId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const results = useListAgentVaultSkills(
    projectId,
    { search: debouncedSearch.trim() || undefined, limit: PICKER_LIMIT },
    { enabled: !isReadOnly }
  );

  const itemsById = useMemo(
    () =>
      new Map(
        (catalog.data?.items ?? []).map((skill) => [
          skill.id,
          { id: skill.id, name: skill.name, description: skill.description }
        ])
      ),
    [catalog.data]
  );
  const searchResults = useMemo(
    () =>
      (results.data?.skills ?? []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description
      })),
    [results.data]
  );

  return (
    <ResourceAccessCardView
      {...props}
      rowKey="skills"
      isReadOnly={isReadOnly}
      itemsById={itemsById}
      isCatalogPending={catalog.isPending}
      isCatalogCutShort={(catalog.data?.items.length ?? 0) < (catalog.data?.totalCount ?? 0)}
      searchResults={searchResults}
      isSearching={results.isFetching || search !== debouncedSearch}
      hasMoreResults={(results.data?.totalCount ?? 0) > searchResults.length}
      onSearchChange={setSearch}
    />
  );
};
