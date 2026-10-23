import { type ReactNode, useEffect, useRef, useState } from "react";
import { GitCommitIcon, GroupIcon } from "lucide-react";

import { Banner } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
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
import { Field } from "@app/components/v4/ui/field";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
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
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import { NEXT_PHASE, type RowContext } from "./secrets/overview-cells";
import { FolderRow, ImportRow, KindRow } from "./secrets/resource-rows";
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
  type Secret
} from "./secrets-model";
import { useSecretsScenario } from "./secrets-scenarios";
import { projectSections, user } from "./shared";

import styles from "./secrets/overview.module.css";

type Of<K extends ResourceKind> = Extract<Resource, { kind: K }>;
type Editable = Of<"secret" | "folder">;
type Draft = {
  kind: "secret" | "folder";
  resource?: Editable;
  environments: string[];
  name: string;
  value: string;
};
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
  const [draft, setDraft] = useState<Draft>();
  const [initialDraft, setInitialDraft] = useState("");
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState<Editable[]>();
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const [recovered, setRecovered] = useState(false);
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
  if (visibleEnvironments.some((environment) => environment.value === "prod"))
    writeBlock = `${NEXT_PHASE}: Production changes go through approval requests`;
  if (readOnly) writeBlock = "Access restricted";
  if (unavailable) writeBlock = "Resources are not available in this scenario";
  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || draft || deleting)
        return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!root.current?.getClientRects().length) return;
      event.preventDefault();
      search.current?.focus();
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, [draft, deleting]);

  const resetView = () => {
    setPage(1);
    setSelected([]);
    setNotice("");
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
    onToggleSelect: (key) =>
      setSelected(
        selected.includes(key) ? selected.filter((entry) => entry !== key) : [...selected, key]
      ),
    report
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

  const openDraft = (
    kind: Draft["kind"],
    resource?: Editable,
    targets = visibleEnvironments.map((environment) => environment.value),
    name = resource?.name ?? ""
  ) => {
    const next = {
      kind,
      resource,
      environments: targets,
      name,
      value:
        resource?.kind === "secret"
          ? (readableValue(resource) ?? "")
          : (resource?.description ?? "")
    };
    setDraft(next);
    setInitialDraft(JSON.stringify(next));
    setValidation("");
  };
  const closeDraft = () => {
    if (draft && JSON.stringify(draft) !== initialDraft) setDiscard(true);
    else setDraft(undefined);
  };
  const create = (kind: Draft["kind"], name: string, value: string, targets: string[]) => {
    const timestamp = new Date().toISOString();
    setResources((current) => [
      ...current,
      ...targets.map((environment): Resource => {
        const base = {
          id: crypto.randomUUID(),
          project,
          environment,
          path,
          name,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        return kind === "folder"
          ? { ...base, kind: "folder", description: value }
          : {
              ...base,
              kind: "secret",
              value: { status: "present", value },
              version: 1,
              comment: "",
              tags: [],
              metadata: []
            };
      })
    ]);
    setNotice(`Created ${name} in local demo data.`);
  };
  const save = () => {
    if (!draft || writeBlock) return;
    const name = draft.name.trim();
    if (
      !name ||
      (draft.kind === "folder" && (name.includes("/") || name === "." || name === "..")) ||
      (draft.kind === "secret" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    ) {
      setValidation(
        draft.kind === "secret"
          ? "Use a key that starts with a letter or underscore and contains only letters, numbers, or underscores."
          : "Enter a folder name without slashes, . or .."
      );
      return;
    }
    if (
      resources.some(
        (resource) =>
          resource.project === project &&
          resource.path === path &&
          draft.environments.includes(resource.environment) &&
          resource.kind === draft.kind &&
          resource.name === name &&
          resource.id !== draft.resource?.id
      )
    ) {
      setValidation(`A ${draft.kind} with this name already exists in a selected environment.`);
      return;
    }
    const original = draft.resource;
    if (!original) {
      create(draft.kind, name, draft.value, draft.environments);
      setDraft(undefined);
      return;
    }
    const timestamp = new Date().toISOString();
    const prefix = path === "/" ? "" : path;
    setResources((current) =>
      current.map((resource): Resource => {
        if (resource.id === original.id)
          return resource.kind === "secret"
            ? {
                ...resource,
                name,
                value: { status: "present", value: draft.value },
                version: resource.version + 1,
                updatedAt: timestamp
              }
            : ({ ...original, name, description: draft.value, updatedAt: timestamp } as Resource);
        const oldPath = `${prefix}/${original.name}`;
        if (
          original.kind === "folder" &&
          resource.project === project &&
          resource.environment === original.environment &&
          (resource.path === oldPath || resource.path.startsWith(`${oldPath}/`))
        )
          return { ...resource, path: `${prefix}/${name}${resource.path.slice(oldPath.length)}` };
        return resource;
      })
    );
    setNotice(`Updated ${name} in local demo data.`);
    setDraft(undefined);
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
    onEdit: (secret) => openDraft("secret", secret, [secret.environment]),
    onCreateIn: (environment, key) => openDraft("secret", undefined, [environment], key),
    onDelete: (secret) => setDeleting([secret]),
    importedFrom
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
              <Button
                icon="plus"
                disabled={Boolean(writeBlock)}
                onClick={() => openDraft("secret")}
              >
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
  const draftForm = draft && (
    <form
      id="secret-draft"
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Field label={draft.kind === "secret" ? "Key" : "Name"} error={validation || undefined}>
        <Input
          autoFocus
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label={draft.kind === "secret" ? "Value" : "Description"}>
        <Textarea
          value={draft.value}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
        />
      </Field>
      {!draft.resource && draft.environments.length > 0 && (
        <Field label="Environments">
          <MultiSelect
            label="Environments"
            options={environments}
            value={draft.environments}
            onChange={(value) => setDraft({ ...draft, environments: value })}
          />
        </Field>
      )}
    </form>
  );
  const draftTitle = `${draft?.resource ? "Edit" : "Create"} ${draft?.kind === "folder" ? "folder" : "secret"}`;

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
              <Card
                variant="framed"
                footer={
                  <div className={styles.footer}>
                    {notice ? (
                      <p role="status" className={styles.notice}>
                        {notice}
                      </p>
                    ) : (
                      <ResourceCount counts={totals} />
                    )}
                    {!unavailableState && (
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
                }
              >
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
                    onNewSecret={() => openDraft("secret")}
                    onNewFolder={() => openDraft("folder")}
                  />
                </div>
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
                                  onEdit={(folder) =>
                                    openDraft("folder", folder, [folder.environment])
                                  }
                                  onDelete={(folder) => setDeleting([folder])}
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
                                "secret",
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
              </Card>
            </div>
          </PageGutter>
        </AppInset>
        <FloatingActionBar
          placement="fixed"
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
            { label: "Copy to new source", icon: "copy", disabled: true, onClick: () => undefined }
          ]}
        />
        <Sheet
          open={draft?.kind === "secret"}
          onOpenChange={(open) => {
            if (!open) closeDraft();
          }}
        >
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{draftTitle}</SheetTitle>
              <SheetDescription>
                {`${currentProject.label}, ${path}. Changes affect local demo data only.`}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>{draft?.kind === "secret" && draftForm}</SheetBody>
            <SheetFooter>
              <Button variant="ghost" onClick={closeDraft}>
                Cancel
              </Button>
              <Button form="secret-draft" type="submit">
                Save
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <Dialog
          open={draft?.kind === "folder"}
          onOpenChange={(open) => {
            if (!open) closeDraft();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{draftTitle}</DialogTitle>
              <DialogDescription>
                {`${currentProject.label}, ${path}. Changes affect local demo data only.`}
              </DialogDescription>
            </DialogHeader>
            {draft?.kind === "folder" && draftForm}
            <DialogFooter>
              <Button variant="ghost" onClick={closeDraft}>
                Cancel
              </Button>
              <Button form="secret-draft" type="submit">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={discard} onOpenChange={setDiscard}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Discard changes?</DialogTitle>
              <DialogDescription>Your unsaved changes will be lost.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscard(false)}>
                Keep editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setDiscard(false);
                  setDraft(undefined);
                }}
              >
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      </AppShell>
    </TooltipProvider>
  );
}

export default function Secrets() {
  const scenario = useSecretsScenario();
  return <Overview key={scenario} scenario={scenario} />;
}
