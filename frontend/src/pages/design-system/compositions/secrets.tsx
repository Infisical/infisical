import { type ReactNode, useEffect, useRef, useState } from "react";
import { GitCommitIcon, GroupIcon } from "lucide-react";

import { Banner } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
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
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Sidebar } from "@app/components/v4/ui/sidebar";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import type { ToastItem } from "@app/components/v4/ui/toast-stack";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { addFlows, type FlowFeedback, FlowToasts, type NewResource } from "./secrets/flows";
import { LOCAL_ONLY } from "./secrets/flows/shared";
import { NEXT_PHASE, type RowContext } from "./secrets/overview-cells";
import { FolderRow, ImportRow, KindRow } from "./secrets/resource-rows";
import { DynamicSecretActions } from "./secrets/row-actions/dynamic-secret-actions";
import { EditFolderDialog } from "./secrets/row-actions/edit-folder-dialog";
import { FolderActions } from "./secrets/row-actions/folder-actions";
import { HoneyTokenActions } from "./secrets/row-actions/honey-token-actions";
import { ImportActions } from "./secrets/row-actions/import-actions";
import { ProxiedServiceActions } from "./secrets/row-actions/proxied-service-actions";
import { RotationActions } from "./secrets/row-actions/rotation-actions";
import type { RowAction } from "./secrets/row-actions/types";
import { SecretRow, type SecretRowHandlers } from "./secrets/secret-row";
import {
  AddNewMenu,
  ExportMenu,
  FolderBreadcrumbBar,
  QuickAddRow,
  ResourceCount,
  ResourceFilterMenu
} from "./secrets/toolbar";
import {
  commitCounts,
  createResources,
  environments,
  projects,
  readableValue,
  type Resource,
  resourceKey,
  type ResourceKind,
  type Scenario,
  scopeMatches,
  type Secret,
  versionsOf
} from "./secrets-model";
import { useSecretsScenario } from "./secrets-scenarios";
import { projectSections, user } from "./shared";

import styles from "./secrets/overview.module.css";

type Of<K extends ResourceKind> = Extract<Resource, { kind: K }>;
type Editable = Of<"secret" | "folder">;
type SortField = "name" | "updatedAt" | "createdAt";
type Sort = { field: SortField; direction: "asc" | "desc"; environment?: string };
const overviewOrder: ResourceKind[] = [
  "import",
  "folder",
  "dynamic",
  "rotation",
  "honey",
  "proxy",
  "secret"
];
const sortOptions: { value: string; label: string; field: SortField; direction: "asc" | "desc" }[] =
  [
    { value: "name-asc", label: "Name (A to Z)", field: "name", direction: "asc" },
    { value: "name-desc", label: "Name (Z to A)", field: "name", direction: "desc" },
    { value: "updatedAt-desc", label: "Last edited (new)", field: "updatedAt", direction: "desc" },
    { value: "updatedAt-asc", label: "Last edited (old)", field: "updatedAt", direction: "asc" },
    { value: "createdAt-desc", label: "Created (new)", field: "createdAt", direction: "desc" },
    { value: "createdAt-asc", label: "Created (old)", field: "createdAt", direction: "asc" }
  ];
const selectableKinds: ResourceKind[] = ["secret", "folder", "rotation"];

function Overview({ scenario }: { scenario: Scenario }) {
  const [resources, setResources] = useState(() => createResources(scenario));
  const [project, setProject] = useState(projects[0].value);
  const [environmentIds, setEnvironmentIds] = useState(
    scenario === "compare" ? environments.map((environment) => environment.value) : ["dev"]
  );
  const [path, setPath] = useState("/");
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<ResourceKind[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ field: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [revealAll, setRevealAll] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingFolder, setEditingFolder] = useState<Of<"folder">>();
  const [deletingFolder, setDeletingFolder] = useState<Of<"folder">>();
  const [deleting, setDeleting] = useState<Editable[]>();
  const [notice, setNotice] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [flow, setFlow] = useState<{
    kind: ResourceKind;
    session: number;
    initial?: { environments?: string[]; name?: string };
  }>();
  const [flowOpen, setFlowOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [rowAction, setRowAction] = useState<RowAction>();
  const revealed = useRef("");
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const visibleEnvironments = environments.filter(
    (environment) => !environmentIds.length || environmentIds.includes(environment.value)
  );
  const single = visibleEnvironments.length === 1;
  const activeEnvironment = visibleEnvironments[0].value;
  const currentProject = projects.find((entry) => entry.value === project)!;
  const unavailable =
    scenario === "loading" ||
    scenario === "no-environments" ||
    scenario === "legacy" ||
    (scenario === "error" && !recovered);
  const readOnly = scenario === "permissions";
  let writeBlock: string | undefined;
  if (readOnly) writeBlock = "Access restricted";
  if (unavailable) writeBlock = "Resources are not available in this scenario";
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        editingFolder ||
        deletingFolder ||
        deleting ||
        flowOpen ||
        rowAction
      )
        return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!root.current?.getClientRects().length) return;
      event.preventDefault();
      search.current?.focus();
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, [editingFolder, deletingFolder, deleting, flowOpen, rowAction]);

  const resetView = () => {
    setPage(1);
    setSelected([]);
    setNotice("");
    setRecent([]);
  };
  const navigate = (nextPath: string) => {
    setPath(nextPath);
    setQuery("");
    resetView();
  };
  const scoped = resources.filter(
    (resource) =>
      resource.project === project &&
      resource.path === path &&
      visibleEnvironments.some((environment) => environment.value === resource.environment)
  );
  const groups = new Map<string, Resource[]>();
  scoped.forEach((resource) => {
    const key = resourceKey(resource);
    groups.set(key, [...(groups.get(key) ?? []), resource]);
  });
  const matches = [...groups.entries()].filter(
    ([, entries]) =>
      entries[0].name.toLowerCase().includes(query.trim().toLowerCase()) &&
      (!types.length || types.includes(entries[0].kind)) &&
      (!tags.length ||
        (entries[0].kind === "secret" &&
          entries.some(
            (entry) => entry.kind === "secret" && tags.some((tag) => entry.tags.includes(tag))
          )))
  );
  const sortValue = (entries: Resource[]) => {
    if (sort.field === "name") return entries[0].name;
    const environment = sort.environment ?? activeEnvironment;
    return entries.find((entry) => entry.environment === environment)?.[sort.field] ?? "";
  };
  const ordered = overviewOrder.flatMap((kind) =>
    matches
      .filter(([, entries]) => entries[0].kind === kind)
      .sort(
        ([, a], [, b]) =>
          sortValue(a).localeCompare(sortValue(b)) * (sort.direction === "desc" ? -1 : 1)
      )
  );
  const totals = Object.fromEntries(
    overviewOrder.map((kind) => [
      kind,
      ordered.filter(([, entries]) => entries[0].kind === kind).length
    ])
  ) as Record<ResourceKind, number>;
  const totalCount = ordered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
  const currentPage = Math.min(page, pageCount);
  const windowRows = ordered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const isLastPage = currentPage === pageCount;
  useEffect(() => {
    const signature = recent.join("|");
    if (!signature || revealed.current === signature) return;
    const index = ordered.findIndex(([key]) => recent.includes(key));
    if (index < 0) return;
    const target = Math.floor(index / perPage) + 1;
    if (target !== currentPage) {
      setPage(target);
      return;
    }
    revealed.current = signature;
    root.current
      ?.querySelector('tbody tr[data-state="selected"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [recent, ordered, perPage, currentPage]);
  const isFiltered = Boolean(query.trim() || types.length || tags.length);
  const tagOptions = [
    ...new Set(
      resources.flatMap((resource) =>
        resource.kind === "secret" && resource.project === project ? resource.tags : []
      )
    )
  ].sort();
  const selectableOnPage = windowRows
    .filter(
      ([, entries]) =>
        selectableKinds.includes(entries[0].kind) && (single || entries[0].kind !== "rotation")
    )
    .map(([key]) => key);
  const selectedEntries = scoped.filter((resource) => selected.includes(resourceKey(resource)));
  const report = (message: string) => setNotice(message);
  const ctx: RowContext = {
    environments: visibleEnvironments,
    single,
    path,
    writeBlock,
    selected,
    recent,
    onToggleSelect: (key) =>
      setSelected(
        selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]
      ),
    report,
    onAction: setRowAction
  };
  const importedFrom = (environment: string, key: string) =>
    resources
      .filter(
        (resource): resource is Of<"import"> =>
          resource.kind === "import" &&
          !resource.revoked &&
          resource.project === project &&
          resource.path === path &&
          resource.environment === environment
      )
      .find((entry) =>
        resources.some(
          (resource) =>
            resource.kind === "secret" &&
            resource.name === key &&
            scopeMatches(resource, entry.source)
        )
      )?.source.environment;
  const sourceSecrets = (entry: Of<"import">) =>
    resources.filter(
      (resource): resource is Secret =>
        resource.kind === "secret" && scopeMatches(resource, entry.source)
    );

  const pushToast = (item: Omit<ToastItem, "id">) =>
    setToasts((current) => [...current, { ...item, id: crypto.randomUUID() }]);
  const insert = (created: NewResource[], feedback: FlowFeedback) => {
    const timestamp = new Date().toISOString();
    setResources((current) => [
      ...current,
      ...created.map(
        (resource) =>
          ({
            ...resource,
            id: crypto.randomUUID(),
            createdAt: timestamp,
            updatedAt: timestamp
          }) as Resource
      )
    ]);
    setNotice("");
    setRecent([
      ...new Set(
        created
          .filter((resource) => resource.project === project && resource.path === path)
          .map(resourceKey)
      )
    ]);
    pushToast({ tone: "ok", ...feedback });
  };
  const openFlow = (kind: ResourceKind, initial?: { environments?: string[]; name?: string }) => {
    setFlow({ kind, session: (flow?.session ?? 0) + 1, initial });
    setFlowOpen(true);
    setRecent([]);
  };
  const create = (name: string, value: string, targets: string[]) =>
    insert(
      targets.map((environment) => ({
        kind: "secret",
        project,
        environment,
        path,
        name,
        value: { status: "present", value },
        version: 1,
        comment: "",
        tags: [],
        metadata: []
      })),
      { title: `Created ${name} in local demo data.` }
    );
  const folderTargets = (folder: Of<"folder">) =>
    resources.filter(
      (resource): resource is Of<"folder"> =>
        resource.kind === "folder" &&
        resource.project === folder.project &&
        resource.path === folder.path &&
        resource.name === folder.name &&
        (!single || resource.environment === folder.environment)
    );
  const updateFolder = (folder: Of<"folder">, name: string, description: string) => {
    setEditingFolder(undefined);
    const targets = folderTargets(folder);
    const taken = targets.filter((target) =>
      resources.some(
        (resource) =>
          resource.kind === "folder" &&
          resource.project === target.project &&
          resource.environment === target.environment &&
          resource.path === target.path &&
          resource.name === name &&
          resource.id !== target.id
      )
    );
    if (taken.length) {
      pushToast({
        tone: "bad",
        title: single ? "Failed to update folder" : "Failed to rename folder across environments",
        description: `A folder named ${name} already exists in ${taken
          .map((target) => environments.find((entry) => entry.value === target.environment)?.label)
          .join(", ")}.`
      });
      return;
    }
    const timestamp = new Date().toISOString();
    const prefix = path === "/" ? "" : path;
    const oldPath = `${prefix}/${folder.name}`;
    setResources((current) =>
      current.map((resource): Resource => {
        const target = targets.find((entry) => entry.id === resource.id);
        if (target) return { ...target, name, description, updatedAt: timestamp };
        if (
          resource.project === project &&
          targets.some((entry) => entry.environment === resource.environment) &&
          (resource.path === oldPath || resource.path.startsWith(`${oldPath}/`))
        )
          return { ...resource, path: `${prefix}/${name}${resource.path.slice(oldPath.length)}` };
        return resource;
      })
    );
    setNotice("");
    pushToast({
      tone: "ok",
      title: single
        ? `Folder "${name}" updated`
        : "Successfully renamed folder across environments",
      description: LOCAL_ONLY
    });
  };
  const remove = (targets: Editable[]) => {
    setResources((current) =>
      current.filter(
        (resource) =>
          !targets.some((target) => {
            const folderPath = `${target.path === "/" ? "" : target.path}/${target.name}`;
            return (
              resource.id === target.id ||
              (target.kind === "folder" &&
                resource.project === target.project &&
                resource.environment === target.environment &&
                (resource.path === folderPath || resource.path.startsWith(`${folderPath}/`)))
            );
          })
      )
    );
    setNotice(
      `Deleted ${[...new Set(targets.map((target) => target.name))].join(", ")} from local demo data.`
    );
    setDeleting(undefined);
    setSelected([]);
  };
  const deleteFolder = (folder: Of<"folder">) => {
    setDeletingFolder(undefined);
    remove(folderTargets(folder));
    setNotice("");
    pushToast({
      tone: "ok",
      title: single ? `Folder "${folder.name}" deleted` : "Successfully deleted folder",
      description: LOCAL_ONLY
    });
  };
  const envFile = (environment: string, keys?: string[]) => {
    const scope = { project, environment, path };
    const local = resources.filter(
      (resource): resource is Secret => resource.kind === "secret" && scopeMatches(resource, scope)
    );
    const inherited = resources
      .filter(
        (resource): resource is Of<"import"> =>
          resource.kind === "import" && !resource.revoked && scopeMatches(resource, scope)
      )
      .flatMap(sourceSecrets);
    const seen = new Set<string>();
    return [...local, ...inherited]
      .filter((secret) => {
        if (seen.has(secret.name) || (keys && !keys.includes(secret.name))) return false;
        seen.add(secret.name);
        return readableValue(secret) !== undefined;
      })
      .map((secret) => `${secret.name}=${JSON.stringify(readableValue(secret))}`);
  };
  const exportEnv = async (environment: string, action: "clipboard" | "download") => {
    const text = `${envFile(environment).join("\n")}\n`;
    try {
      if (action === "clipboard") {
        await navigator.clipboard.writeText(text);
        setNotice("Secrets copied to clipboard. They are ready to paste.");
        return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${environment}.env`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Downloaded ${environment}.env with fake values from this preview.`);
    } catch {
      setNotice("Failed to export secrets. Please try again later.");
    }
  };
  const exportBlock = (() => {
    if (!single) return "Select a single environment to export secrets";
    if (!envFile(activeEnvironment).length) return "No secrets in this folder";
    return undefined;
  })();
  const sortLabel = sortOptions.find(
    (option) => option.field === sort.field && option.direction === sort.direction
  )?.label;
  const colSpan = visibleEnvironments.length + 2;
  const commitCount = single ? commitCounts[`${project}:${activeEnvironment}:${path}`] : undefined;
  const canQuickAdd = !writeBlock && isLastPage && totalCount > 0;
  const gate = (reason: string | undefined, node: ReactNode) =>
    reason ? (
      <Tooltip content={reason}>
        <span className={styles.actionSlot}>{node}</span>
      </Tooltip>
    ) : (
      node
    );
  const handlers: SecretRowHandlers = {
    onCreateIn: (environment, key) =>
      openFlow("secret", { environments: [environment], name: key }),
    onDelete: (secret) => setDeleting([secret]),
    onUpdate: (secret, { value, ...patch }, feedback) => {
      const timestamp = new Date().toISOString();
      setResources((current) =>
        current.map((resource): Resource => {
          if (resource.id !== secret.id || resource.kind !== "secret") return resource;
          if (value === undefined) return { ...resource, ...patch };
          const version = resource.version + 1;
          return {
            ...resource,
            ...patch,
            value: { status: "present", value },
            version,
            updatedAt: timestamp,
            versions: [
              { version, value, createdAt: timestamp, actor: user.name, actorType: "user" },
              ...versionsOf(resource)
            ]
          };
        })
      );
      setNotice("");
      pushToast({ tone: "ok", ...feedback });
    },
    onNavigate: (environment, nextPath, key) => {
      navigate(nextPath);
      setEnvironmentIds([environment]);
      setQuery(key);
    },
    importedFrom,
    resources,
    tagOptions
  };
  const allOnPage =
    selectableOnPage.length > 0 && selectableOnPage.every((key) => selected.includes(key));
  const someOnPage = selectableOnPage.some((key) => selected.includes(key));
  const selectedSecretNames = [
    ...new Set(
      selectedEntries.filter((entry) => entry.kind === "secret").map((entry) => entry.name)
    )
  ];
  const deletable = selectedEntries.filter(
    (entry): entry is Editable => entry.kind === "secret" || entry.kind === "folder"
  );
  const clearFilters = () => {
    setQuery("");
    setTypes([]);
    setTags([]);
    resetView();
  };
  const emptyState = (() => {
    if (query.trim())
      return (
        <EmptyState
          icon="search"
          title="No matches in this folder"
          description="Try a different search, or search every folder in this environment."
          actions={
            <>
              <Button variant="outline" onClick={clearFilters}>
                Clear search
              </Button>
              {gate(
                NEXT_PHASE,
                <Button variant="outline" disabled>
                  Search all folders
                </Button>
              )}
            </>
          }
        />
      );
    if (isFiltered)
      return (
        <EmptyState
          icon="search"
          title="No resources match these filters"
          actions={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      );
    return (
      <EmptyState
        icon="upload"
        title="This table is empty"
        description="Drag and drop a secrets file here"
        actions={
          <>
            {gate(
              NEXT_PHASE,
              <Button variant="outline" icon="upload" disabled>
                Upload secrets
              </Button>
            )}
            {gate(
              NEXT_PHASE,
              <Button variant="outline" icon="copy" disabled>
                Paste secrets
              </Button>
            )}
            {gate(
              writeBlock,
              <Button icon="plus" disabled={Boolean(writeBlock)} onClick={() => openFlow("secret")}>
                Add a new secret
              </Button>
            )}
          </>
        }
      />
    );
  })();
  const unavailableState = (() => {
    if (scenario === "no-environments")
      return (
        <EmptyState
          icon="folder"
          title="No environments yet"
          description="Create an environment before adding secrets."
          actions={gate(
            NEXT_PHASE,
            <Button icon="plus" disabled>
              Add environment
            </Button>
          )}
        />
      );
    if (scenario === "legacy")
      return (
        <EmptyState
          icon="lock"
          title="Secrets engine upgrade required"
          description="This project uses the legacy engine. Upgrade the project to manage secrets here."
          actions={gate(NEXT_PHASE, <Button disabled>Upgrade project</Button>)}
        />
      );
    if (scenario === "error" && !recovered)
      return (
        <EmptyState
          icon="alert"
          title="Could not load resources"
          description="The overview request failed. Retry to load this folder."
          actions={
            <Button
              onClick={() => {
                setRecovered(true);
                setNotice("Loaded local demo resources after retry.");
              }}
            >
              Retry
            </Button>
          }
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
            if (!option) return;
            setSort({ field: option.field, direction: option.direction });
            setPage(1);
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
                if (!option) return;
                setSort({
                  field: option.field,
                  direction: option.direction,
                  environment: environment.value
                });
                setPage(1);
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
          onSelect={async () => {
            try {
              await navigator.clipboard.writeText(environment.value);
              setNotice("Environment slug copied to clipboard.");
            } catch {
              setNotice("Failed to copy the environment slug.");
            }
          }}
        >
          <Icon name="copy" />
          Copy environment slug
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportEnv(environment.value, "download")}>
          <Icon name="download" />
          Download as .env
        </DropdownMenuItem>
        <DropdownMenuItem disabled description={NEXT_PHASE}>
          <Icon icon={GitCommitIcon} />
          View commit history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled description={NEXT_PHASE}>
          <Icon name="trash" />
          Delete environment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TooltipProvider>
      <AppShell ref={root} className={styles.shell}>
        <Sidebar
          label="Secrets navigation"
          current="secrets"
          onNavigate={() => navigate("/")}
          sections={(projectSections ?? []).map((section) => ({
            ...section,
            items: section.items.map((item) => ({
              ...item,
              count: undefined,
              disabled: item.id !== "secrets"
            }))
          }))}
          user={user}
        />
        <AppInset>
          <TopBar
            breadcrumb={[
              { label: "Acme Corp" },
              { label: "Secrets Management" },
              {
                label: project,
                mono: true,
                menu: {
                  label: "Switch project",
                  options: projects,
                  value: project,
                  onChange: (value) => {
                    setProject(value);
                    setPath("/");
                    setQuery("");
                    setTags([]);
                    resetView();
                  }
                }
              }
            ]}
          />
          <PageGutter>
            <div className={styles.page}>
              <PageHeader
                size="md"
                title={currentProject.label}
                mono
                breadcrumb={[{ label: "All projects" }]}
              />
              {readOnly && (
                <Banner
                  action={gate(
                    NEXT_PHASE,
                    <Button variant="outline" size="xs" disabled>
                      Request access
                    </Button>
                  )}
                >
                  You do not have permission to create, edit, or delete secrets in this folder
                </Banner>
              )}
              <div className={styles.toolbar}>
                <div className={styles.envPicker}>
                  <MultiSelect
                    label="Environments"
                    options={scenario === "no-environments" ? [] : environments}
                    value={scenario === "no-environments" ? [] : environmentIds}
                    onChange={(value) => {
                      setEnvironmentIds(value);
                      setSort({ field: "name", direction: "asc" });
                      resetView();
                    }}
                    placeholder="All environments"
                    allLabel="All environments"
                    searchable
                    disabled={unavailable}
                  />
                </div>
                <div className={styles.search}>
                  <Input
                    ref={search}
                    aria-label="Search resources"
                    icon="search"
                    placeholder="Search by secret or folder name..."
                    kbd="/"
                    value={query}
                    disabled={unavailable}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                      setSelected([]);
                    }}
                  />
                </div>
                <ResourceFilterMenu
                  types={types}
                  onToggleType={(kind) => {
                    setTypes(
                      types.includes(kind)
                        ? types.filter((entry) => entry !== kind)
                        : [...types, kind]
                    );
                    resetView();
                  }}
                  tags={tagOptions}
                  selectedTags={tags}
                  onToggleTag={(tag) => {
                    setTags(
                      tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag]
                    );
                    resetView();
                  }}
                  onClearTags={() => {
                    setTags([]);
                    resetView();
                  }}
                />
                <ExportMenu
                  disabledReason={unavailable ? writeBlock : exportBlock}
                  secretCount={single ? envFile(activeEnvironment).length : 0}
                  onExport={(action) => exportEnv(activeEnvironment, action)}
                />
                <AddNewMenu
                  writeBlock={writeBlock}
                  single={single}
                  available={Object.fromEntries(Object.keys(addFlows).map((kind) => [kind, true]))}
                  onAdd={(kind) => openFlow(kind)}
                />
              </div>
              <div className={styles.tableBlock}>
                <div className={styles.tableFrame}>
                  <FolderBreadcrumbBar
                    path={path}
                    single={single}
                    onNavigate={navigate}
                    report={report}
                  />
                  {unavailableState ?? (
                    <Table
                      className={styles.table}
                      data-mode={single ? "single" : "multi"}
                      aria-label={`Resources in ${project} at ${path}`}
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
                                disabled={!selectableOnPage.length}
                                onCheckedChange={() =>
                                  setSelected(
                                    allOnPage
                                      ? selected.filter((key) => !selectableOnPage.includes(key))
                                      : [...new Set([...selected, ...selectableOnPage])]
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
                                    NEXT_PHASE,
                                    <Button variant="ghost" size="xs" icon="git" disabled>
                                      <span className={styles.headLabel}>
                                        {commitCount === undefined
                                          ? "Commit history"
                                          : `${commitCount} commits`}
                                      </span>
                                    </Button>
                                  )}
                                  {gate(
                                    NEXT_PHASE,
                                    <Button variant="ghost" size="xs" disabled>
                                      <Icon icon={GroupIcon} />
                                      <span className={styles.headLabel}>Batch edit</span>
                                    </Button>
                                  )}
                                </span>
                              </div>
                            </TableHead>
                          ) : (
                            visibleEnvironments.map((environment) => (
                              <TableHead key={environment.value} className={styles.envHead}>
                                <div className={styles.headLine}>
                                  {environmentMenu(environment)}
                                </div>
                              </TableHead>
                            ))
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scenario === "loading" &&
                          Array.from({ length: 8 }, (_, index) => (
                            <TableRow key={`skeleton-${index + 1}`}>
                              <TableCell className={styles.iconCell}>
                                <Skeleton
                                  width="var(--v4-size-icon)"
                                  height="var(--v4-size-icon)"
                                />
                              </TableCell>
                              <TableCell colSpan={colSpan - 1}>
                                <Skeleton
                                  width="var(--v4-size-text-min)"
                                  height="var(--v4-size-icon)"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        {scenario !== "loading" && totalCount === 0 && (
                          <TableRow>
                            <TableCell colSpan={colSpan} className={styles.emptyCell}>
                              {emptyState}
                            </TableCell>
                          </TableRow>
                        )}
                        {scenario !== "loading" &&
                          windowRows.map(([key, entries]) => {
                            const first = entries[0];
                            if (first.kind === "import")
                              return (
                                <ImportRow
                                  key={key}
                                  rowKey={key}
                                  entries={entries as Of<"import">[]}
                                  ctx={ctx}
                                  sourceSecrets={sourceSecrets}
                                  projectName={project}
                                />
                              );
                            if (first.kind === "folder")
                              return (
                                <FolderRow
                                  key={key}
                                  rowKey={key}
                                  entries={entries as Of<"folder">[]}
                                  ctx={ctx}
                                  onOpen={() =>
                                    navigate(`${path === "/" ? "" : path}/${first.name}`)
                                  }
                                  onEdit={setEditingFolder}
                                  onDelete={setDeletingFolder}
                                />
                              );
                            if (first.kind === "secret")
                              return (
                                <SecretRow
                                  key={key}
                                  rowKey={key}
                                  entries={entries as Secret[]}
                                  ctx={ctx}
                                  revealAll={revealAll}
                                  handlers={handlers}
                                />
                              );
                            return (
                              <KindRow
                                key={key}
                                rowKey={key}
                                kind={first.kind}
                                entries={entries}
                                ctx={ctx}
                              />
                            );
                          })}
                        {canQuickAdd && (
                          <QuickAddRow
                            multiple={!single}
                            colSpan={single ? 1 : visibleEnvironments.length}
                            existing={ordered
                              .filter(([, entries]) => entries[0].kind === "secret")
                              .map(([, entries]) => entries[0].name)}
                            onCreate={(key, value) =>
                              create(
                                key,
                                value,
                                visibleEnvironments.map((environment) => environment.value)
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
                          page={currentPage}
                          total={totalCount}
                          pageSize={perPage}
                          pageSizeOptions={[10, 20, 50, 100]}
                          onPageChange={(value) => {
                            setPage(value);
                            setSelected([]);
                          }}
                          onPageSizeChange={(value) => {
                            setPerPage(value);
                            setPage(1);
                            setSelected([]);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </PageGutter>
          <div className={styles.fabDock} data-active={selected.length > 0 || undefined}>
            <FloatingActionBar
              placement="contained"
              count={selected.length}
              total={selectableOnPage.length}
              onSelectAll={() => setSelected(selectableOnPage)}
              onClear={() => setSelected([])}
              noun="resources"
              actions={[
                { label: "Add tags", icon: "plus", disabled: true, onClick: () => undefined },
                { label: "Move", icon: "folder", disabled: true, onClick: () => undefined },
                {
                  label: "Copy to clipboard",
                  icon: "copy",
                  disabled: !single || !selectedSecretNames.length,
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${envFile(activeEnvironment, selectedSecretNames).join("\n")}\n`
                      );
                      setNotice("Secrets copied to clipboard. They are ready to paste.");
                    } catch {
                      setNotice("Failed to copy secrets. Please try again later.");
                    }
                  }
                },
                {
                  label: "Delete",
                  icon: "trash",
                  danger: true,
                  disabled: Boolean(writeBlock) || !deletable.length,
                  onClick: () => setDeleting(deletable)
                }
              ]}
              moreActions={[
                {
                  label: "Copy to new source",
                  icon: "copy",
                  disabled: true,
                  onClick: () => undefined
                }
              ]}
            />
          </div>
        </AppInset>
        {editingFolder && (
          <EditFolderDialog
            name={editingFolder.name}
            description={editingFolder.description}
            showDescriptionOverwriteWarning={!single}
            onClose={() => setEditingFolder(undefined)}
            onSave={(name, description) => updateFolder(editingFolder, name, description)}
          />
        )}
        <AlertDialog
          open={Boolean(deletingFolder)}
          onOpenChange={(open) => {
            if (!open) setDeletingFolder(undefined);
          }}
        >
          <AlertDialogContent tone="danger">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete folder</AlertDialogTitle>
              <AlertDialogDescription>
                This folder and all its contents will be removed. You can reverse this action by
                rolling back to a previous commit.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => deletingFolder && deleteFolder(deletingFolder)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {deleting?.length === 1
                  ? `Delete ${deleting[0].name}?`
                  : `Delete ${deleting?.length} resources?`}
              </DialogTitle>
              <DialogDescription>
                {`This removes the selected resources from ${path}. Folders are removed with everything inside them. This cannot be undone.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(undefined)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleting && remove(deleting)}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {(() => {
          const host = {
            onClose: () => setRowAction(undefined),
            scope: { project, path, environments, visibleEnvironments },
            resources,
            onApply: (update: (current: Resource[]) => Resource[], feedback: FlowFeedback) => {
              setResources(update);
              setNotice("");
              pushToast({ tone: "ok", ...feedback });
            },
            onToast: (tone: "ok" | "bad" | "neutral", feedback: FlowFeedback) =>
              pushToast({ tone, ...feedback })
          };
          const pick = <K extends RowAction["kind"]>(kind: K) =>
            rowAction?.kind === kind ? (rowAction as Extract<RowAction, { kind: K }>) : undefined;
          return (
            <>
              <FolderActions action={pick("folder")} {...host} />
              <ImportActions action={pick("import")} {...host} />
              <DynamicSecretActions action={pick("dynamic")} {...host} />
              <RotationActions action={pick("rotation")} {...host} />
              <HoneyTokenActions action={pick("honey")} {...host} />
              <ProxiedServiceActions action={pick("proxy")} {...host} />
            </>
          );
        })()}
        {flow &&
          (() => {
            const Flow = addFlows[flow.kind];
            return (
              Flow && (
                <Flow
                  key={flow.session}
                  open={flowOpen}
                  onOpenChange={setFlowOpen}
                  scope={{ project, path, environments, visibleEnvironments }}
                  resources={resources}
                  initial={flow.initial}
                  onCreate={insert}
                  onError={(feedback) => pushToast({ tone: "bad", ...feedback })}
                  onNotice={(feedback) => pushToast({ tone: "neutral", ...feedback })}
                />
              )
            );
          })()}
        <FlowToasts
          items={toasts}
          onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
        />
      </AppShell>
    </TooltipProvider>
  );
}

export default function Secrets() {
  const scenario = useSecretsScenario();
  return <Overview key={scenario} scenario={scenario} />;
}
