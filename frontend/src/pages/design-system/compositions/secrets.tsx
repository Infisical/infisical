import { Fragment, useEffect, useRef, useState } from "react";

import { Breadcrumb } from "@app/components/v4/ui/breadcrumb";
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
import { Field } from "@app/components/v4/ui/field";
import { Icon, type IconName } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Select } from "@app/components/v4/ui/select";
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
import { AppInset, AppShell, PageGutter, TopBar } from "@app/components/v4/ui/top-bar";

import {
  createResources,
  environments,
  projects,
  readableValue,
  type Resource,
  resourceKey,
  type ResourceKind,
  resourceKinds,
  type Scenario,
  type Secret
} from "./secrets-model";
import { useSecretsScenario } from "./secrets-scenarios";
import { projectSections, user } from "./shared";

import styles from "./secrets.module.css";

const icons: Record<ResourceKind, IconName> = {
  folder: "folder",
  secret: "key",
  import: "download",
  dynamic: "terminal",
  rotation: "sync",
  honey: "alert-c",
  proxy: "globe"
};
const deferred = "This nested flow is not available in the base overview demo.";
function resourceStatus(resource?: Resource): { label: string; icon: IconName } {
  if (!resource) return { label: "Missing", icon: "minus" };
  if (resource.kind === "import")
    return resource.revoked
      ? { label: "Revoked", icon: "alert" }
      : { label: "Imported", icon: "download" };
  if (resource.kind === "secret") {
    if (resource.value.status === "unreadable") return { label: "No access", icon: "lock" };
    if (resource.value.status === "failed") return { label: "Load failed", icon: "alert" };
    if (resource.value.status === "loading") return { label: "Loading", icon: "clock" };
    if (readableValue(resource) === "") return { label: "Empty", icon: "minus" };
  }
  return { label: "Present", icon: "check-c" };
}
type Editable = Extract<Resource, { kind: "secret" | "folder" }>;
type Draft = {
  kind: "secret" | "folder";
  resource?: Editable;
  environment: string;
  name: string;
  value: string;
};

function Value({ secret, report }: { secret: Secret; report: (message: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const value = readableValue(secret);
  let display = revealed ? value : "••••••••••••";
  if (value === undefined) display = "No access";
  if (value === "") display = "Empty value";
  if (secret.value.status === "loading")
    return <Skeleton width="var(--v4-size-text-min)" height="var(--v4-size-icon)" />;
  if (secret.value.status === "failed") return <span role="alert">{secret.value.message}</span>;
  return (
    <div
      className={styles.value}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setRevealed(false);
      }}
    >
      <code className={styles.payload}>{display}</code>
      <Button
        variant="ghost"
        size="icon-xs"
        icon="eye"
        iconOnly
        disabled={value === undefined}
        title={value === undefined ? "You cannot read this value." : undefined}
        aria-pressed={revealed}
        onClick={() => setRevealed(!revealed)}
      >{`${revealed ? "Mask" : "Reveal"} ${secret.name}`}</Button>
      <Button
        variant="ghost"
        size="icon-xs"
        icon="copy"
        iconOnly
        disabled={value === undefined}
        title={value === undefined ? "You cannot copy an unreadable value." : undefined}
        onClick={async () => {
          if (value === undefined) return;
          try {
            await navigator.clipboard.writeText(value);
            report(`Copied ${secret.name}.`);
          } catch {
            report(`Could not copy ${secret.name}. Check clipboard permissions.`);
          }
        }}
      >{`Copy ${secret.name}`}</Button>
    </div>
  );
}

function ResourceSummary({ resource }: { resource: Resource }) {
  switch (resource.kind) {
    case "folder":
      return <span className={styles.muted}>{resource.description || "Folder"}</span>;
    case "import":
      return (
        <span className={styles.muted}>
          {resource.revoked
            ? "Source access revoked"
            : `${resource.source.project} / ${resource.source.environment}${resource.source.path} (${Object.keys(resource.keys).length} keys)`}
        </span>
      );
    case "dynamic":
      return (
        <span className={styles.muted}>
          {resource.provider}, {resource.leases.filter((lease) => !lease.revoked).length} active
          leases
        </span>
      );
    case "rotation":
      return (
        <span className={styles.muted}>
          {resource.provider}, {resource.status}
        </span>
      );
    case "honey":
      return (
        <span className={styles.muted}>
          {resource.status}, {resource.events.length} detections
        </span>
      );
    case "proxy":
      return <code>{resource.host}</code>;
    default:
      return null;
  }
}

function Overview({ scenario }: { scenario: Scenario }) {
  const [resources, setResources] = useState(() => createResources(scenario));
  const [project, setProject] = useState(projects[0].value);
  const [environmentIds, setEnvironmentIds] = useState(
    scenario === "compare" ? environments.map((environment) => environment.value) : ["dev"]
  );
  const [path, setPath] = useState("/");
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState("name-asc");
  const [sortEnvironment, setSortEnvironment] = useState("dev");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [initialDraft, setInitialDraft] = useState("");
  const [discard, setDiscard] = useState(false);
  const [deleting, setDeleting] = useState<Editable>();
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const [recovered, setRecovered] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const visibleEnvironments = environments.filter(
    (environment) => !environmentIds.length || environmentIds.includes(environment.value)
  );
  const multiple = visibleEnvironments.length > 1;
  const activeEnvironment = visibleEnvironments[0].value;
  const currentProject = projects.find((entry) => entry.value === project)!;
  const unavailable =
    scenario === "loading" ||
    scenario === "no-environments" ||
    scenario === "legacy" ||
    (scenario === "error" && !recovered);
  const readOnly = scenario === "permissions";
  const protectedScope = visibleEnvironments.some((environment) => environment.value === "prod");
  const protectedReason =
    "Production changes require the approval flow, which is not available in this phase.";
  let writeReason: string | undefined;
  if (unavailable) writeReason = "Resources are not available in this scenario.";
  if (protectedScope) writeReason = protectedReason;
  if (readOnly) writeReason = "This permission scenario is read-only.";
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
    setExpanded([]);
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
  const filtered = [...groups.entries()].filter(([, entries]) =>
    entries.some(
      (resource) =>
        resource.name.toLowerCase().includes(query.toLowerCase()) &&
        (!types.length || types.includes(resource.kind)) &&
        (!tags.length ||
          (resource.kind === "secret" && tags.some((tag) => resource.tags.includes(tag))))
    )
  );
  filtered.sort(([, a], [, b]) => {
    const direction = sort.endsWith("desc") ? -1 : 1;
    if (sort.startsWith("name")) return a[0].name.localeCompare(b[0].name) * direction;
    const field = sort.startsWith("created") ? "createdAt" : "updatedAt";
    const first = a.find((entry) => entry.environment === sortEnvironment)?.[field] ?? "";
    const second = b.find((entry) => entry.environment === sortEnvironment)?.[field] ?? "";
    return first.localeCompare(second) * direction;
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const eligible = rows
    .filter(([, entries]) => ["secret", "folder", "rotation"].includes(entries[0].kind))
    .map(([key]) => key);
  const allSelected = eligible.length > 0 && eligible.every((key) => selected.includes(key));
  const partiallySelected = eligible.some((key) => selected.includes(key));
  const selectionState = allSelected || (partiallySelected ? "indeterminate" : false);
  const showEmpty = !unavailable && !rows.length;
  const showTable = scenario === "loading" || (!unavailable && rows.length > 0);
  const tagOptions = [
    ...new Set(scoped.flatMap((resource) => (resource.kind === "secret" ? resource.tags : [])))
  ].map((tag) => ({ value: tag, label: tag }));
  const openDraft = (kind: Draft["kind"], resource?: Editable, environment = activeEnvironment) => {
    const next = {
      kind,
      resource,
      environment,
      name: resource?.name ?? "",
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
  const save = () => {
    if (
      !draft ||
      readOnly ||
      unavailable ||
      (draft.resource ? draft.environment === "prod" : protectedScope)
    )
      return;
    const name = draft.name.trim();
    if (
      !name ||
      (draft.kind === "folder" && (name.includes("/") || name === "." || name === "..")) ||
      (draft.kind === "secret" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    ) {
      setValidation(
        draft.kind === "secret"
          ? "Use a key that starts with a letter or underscore and contains only letters, numbers, or underscores."
          : "Enter a folder name without slashes, . or ..."
      );
      return;
    }
    const destinations = draft.resource
      ? [draft.environment]
      : visibleEnvironments.map((environment) => environment.value);
    if (
      resources.some(
        (resource) =>
          resource.project === project &&
          resource.path === path &&
          destinations.includes(resource.environment) &&
          resource.kind === draft.kind &&
          resource.name === name &&
          resource.id !== draft.resource?.id
      )
    ) {
      setValidation(`A ${draft.kind} with this name already exists in a selected environment.`);
      return;
    }
    const timestamp = new Date().toISOString();
    setResources((current) => {
      if (draft.resource) {
        const original = draft.resource;
        const oldPath = `${path === "/" ? "" : path}/${original.name}`;
        const newPath = `${path === "/" ? "" : path}/${name}`;
        return current.map((resource): Resource => {
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
          if (
            original.kind === "folder" &&
            resource.project === project &&
            resource.environment === original.environment &&
            (resource.path === oldPath || resource.path.startsWith(`${oldPath}/`))
          )
            return { ...resource, path: newPath + resource.path.slice(oldPath.length) };
          return resource;
        });
      }
      return [
        ...current,
        ...destinations.map((environment): Resource => {
          const base = {
            id: crypto.randomUUID(),
            project,
            environment,
            path,
            name,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          return draft.kind === "folder"
            ? { ...base, kind: "folder", description: draft.value }
            : {
                ...base,
                kind: "secret",
                value: { status: "present", value: draft.value },
                version: 1,
                comment: "",
                tags: [],
                metadata: []
              };
        })
      ];
    });
    setNotice(`${draft.resource ? "Updated" : "Created"} ${name} in local demo data.`);
    setDraft(undefined);
    setSelected([]);
  };
  const editBlocked = (resource: Resource) =>
    (readOnly || unavailable ? writeReason : undefined) ??
    (resource.environment === "prod" ? protectedReason : undefined) ??
    (resource.kind === "secret" && (resource.managedBy || resource.value.status !== "present")
      ? "Managed or unreadable values cannot be edited in this phase."
      : undefined);
  const valueCell = (resource: Resource) =>
    resource.kind === "secret" ? (
      <Value key={`${resource.id}:${resource.version}`} secret={resource} report={setNotice} />
    ) : (
      <ResourceSummary resource={resource} />
    );
  const rowActions = (resource: Resource) => (
    <div className={styles.actions}>
      {resource.kind === "secret" || resource.kind === "folder" ? (
        <>
          <Button
            variant="ghost"
            size="xs"
            disabled={Boolean(editBlocked(resource))}
            title={editBlocked(resource)}
            onClick={() => openDraft(resource.kind, resource, resource.environment)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            icon="trash"
            iconOnly
            disabled={Boolean(editBlocked(resource))}
            title={editBlocked(resource)}
            onClick={() => setDeleting(resource)}
          >{`Delete ${resource.name}`}</Button>
        </>
      ) : (
        <Button variant="ghost" size="xs" disabled title={deferred}>
          Manage
        </Button>
      )}
    </div>
  );

  return (
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
            disabled: item.id !== "secrets",
            label: item.id === "secrets" ? item.label : `${item.label} (unavailable)`
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
              description={currentProject.description}
              actions={
                <>
                  <Button variant="outline" icon="download" disabled title={deferred}>
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    icon="folder"
                    disabled={Boolean(writeReason)}
                    title={writeReason}
                    onClick={() => openDraft("folder")}
                  >
                    Add Folder
                  </Button>
                  <Button
                    icon="plus"
                    disabled={Boolean(writeReason)}
                    title={writeReason}
                    onClick={() => openDraft("secret")}
                  >
                    Add Secret
                  </Button>
                </>
              }
            />
            <div className={styles.toolbar}>
              <div className={styles.picker}>
                <MultiSelect
                  label="Environments"
                  options={scenario === "no-environments" ? [] : environments}
                  value={scenario === "no-environments" ? [] : environmentIds}
                  onChange={(value) => {
                    setEnvironmentIds(value);
                    setSortEnvironment(value[0] ?? environments[0].value);
                    resetView();
                  }}
                  placeholder={
                    scenario === "no-environments" ? "No Environments" : "All Environments"
                  }
                  allLabel="All Environments"
                  searchable
                  disabled={unavailable}
                />
              </div>
              <div className={styles.search}>
                <Input
                  ref={search}
                  aria-label="Search resources in this folder"
                  icon="search"
                  placeholder="Search by secret or folder name"
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
              <div className={styles.picker}>
                <MultiSelect
                  label="Resource types"
                  options={resourceKinds}
                  value={types}
                  onChange={(value) => {
                    setTypes(value);
                    setPage(1);
                    setSelected([]);
                  }}
                  placeholder="All Types"
                  disabled={unavailable}
                />
              </div>
              <div className={styles.picker}>
                <MultiSelect
                  label="Tags"
                  options={tagOptions}
                  value={tags}
                  onChange={(value) => {
                    setTags(value);
                    setPage(1);
                    setSelected([]);
                  }}
                  placeholder="All Tags"
                  searchable
                  disabled={unavailable}
                />
              </div>
              <div className={styles.picker}>
                <Select
                  aria-label="Sort resources"
                  value={sort}
                  onChange={(value) => {
                    setSort(value);
                    setPage(1);
                  }}
                  options={[
                    { value: "name-asc", label: "Name A–Z" },
                    { value: "name-desc", label: "Name Z–A" },
                    { value: "created-desc", label: "Created: Newest" },
                    { value: "created-asc", label: "Created: Oldest" },
                    { value: "updated-desc", label: "Edited: Newest" },
                    { value: "updated-asc", label: "Edited: Oldest" }
                  ]}
                />
              </div>
              {multiple && !sort.startsWith("name") && (
                <div className={styles.picker}>
                  <Select
                    aria-label="Timestamp sort environment"
                    value={sortEnvironment}
                    options={visibleEnvironments}
                    onChange={setSortEnvironment}
                  />
                </div>
              )}
            </div>
            <div className={styles.context}>
              <div className={styles.breadcrumb}>
                <Breadcrumb
                  items={[
                    { label: "Secrets", onClick: () => navigate("/") },
                    ...path
                      .split("/")
                      .filter(Boolean)
                      .map((segment, index, segments) => ({
                        label: segment,
                        onClick: () => navigate(`/${segments.slice(0, index + 1).join("/")}`)
                      }))
                  ]}
                />
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                icon="copy"
                iconOnly
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(path);
                    setNotice("Copied folder path.");
                  } catch {
                    setNotice("Could not copy the path. Check clipboard permissions.");
                  }
                }}
              >
                Copy Folder Path
              </Button>
              <span className={styles.muted}>
                {scenario === "no-environments"
                  ? "No environments"
                  : visibleEnvironments.map((environment) => environment.label).join(", ")}
              </span>
            </div>
            {writeReason && !unavailable && <p className={styles.notice}>{writeReason}</p>}
            {notice && (
              <p role="status" className={styles.notice}>
                {notice}
              </p>
            )}
            {selected.length > 0 && (
              <div className={styles.selection}>
                <span>{selected.length} selected</span>
                <Button variant="ghost" onClick={() => setSelected([])}>
                  Clear Selection
                </Button>
                <Button variant="outline" disabled title={deferred}>
                  Bulk Actions
                </Button>
              </div>
            )}
            {scenario === "legacy" && (
              <div className={styles.empty}>
                <Icon name="lock" />
                <h2>Secrets engine upgrade required</h2>
                <p>
                  This project uses the legacy engine. A real migration is not available in this
                  local demo.
                </p>
                <Button disabled title="Migration is outside this preview.">
                  Upgrade Project
                </Button>
              </div>
            )}
            {scenario === "no-environments" && (
              <div className={styles.empty}>
                <Icon name="folder" />
                <h2>No environments</h2>
                <p>Create an environment before adding secrets.</p>
                <Button disabled title={deferred}>
                  Add Environment
                </Button>
              </div>
            )}
            {scenario === "error" && !recovered && (
              <div className={styles.empty} role="alert">
                <Icon name="alert" />
                <h2>Could not load resources</h2>
                <p>This is a simulated overview failure, not an empty project.</p>
                <Button
                  onClick={() => {
                    setRecovered(true);
                    setNotice("Loaded local demo resources after retry.");
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
            {showEmpty && (
              <div className={styles.empty}>
                <Icon name="key" />
                <h2>
                  {query || types.length || tags.length
                    ? "No matching resources"
                    : "No resources in this folder"}
                </h2>
                <p>
                  {query || types.length || tags.length
                    ? "Change the search or filters to see resources in this folder."
                    : "Add a secret or folder to this local project."}
                </p>
                {query || types.length || tags.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setTypes([]);
                      setTags([]);
                      resetView();
                    }}
                  >
                    Clear Search and Filters
                  </Button>
                ) : (
                  <Button
                    disabled={Boolean(writeReason)}
                    title={writeReason}
                    onClick={() => openDraft("secret")}
                  >
                    Add Secret
                  </Button>
                )}
              </div>
            )}
            {showTable && (
              <Table
                aria-label={`Resources in ${project}, ${visibleEnvironments.map((environment) => environment.label).join(", ")}, ${path}`}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        aria-label="Select eligible resources on this page"
                        checked={selectionState}
                        disabled={!eligible.length || scenario === "loading"}
                        onCheckedChange={() =>
                          setSelected(
                            allSelected
                              ? selected.filter((key) => !eligible.includes(key))
                              : [...new Set([...selected, ...eligible])]
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    {multiple ? (
                      visibleEnvironments.map((environment) => (
                        <TableHead key={environment.value}>{environment.label}</TableHead>
                      ))
                    ) : (
                      <TableHead>Value</TableHead>
                    )}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenario === "loading"
                    ? Array.from({ length: pageSize }, (_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Skeleton width="var(--v4-size-icon)" height="var(--v4-size-icon)" />
                          </TableCell>
                          <TableCell>
                            <Skeleton
                              width="var(--v4-size-text-min)"
                              height="var(--v4-size-icon)"
                            />
                          </TableCell>
                          <TableCell>
                            <Skeleton
                              width="var(--v4-size-text-min)"
                              height="var(--v4-size-icon)"
                            />
                          </TableCell>
                          <TableCell>
                            <Skeleton
                              width="var(--v4-size-control-sm)"
                              height="var(--v4-size-icon)"
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    : rows.map(([key, entries]) => {
                        const resource = entries[0];
                        const isExpanded = expanded.includes(key);
                        return (
                          <Fragment key={key}>
                            <TableRow data-state={selected.includes(key) ? "selected" : undefined}>
                              <TableCell>
                                {eligible.includes(key) && (
                                  <Checkbox
                                    aria-label={`Select ${resource.name}`}
                                    checked={selected.includes(key)}
                                    onCheckedChange={(checked) =>
                                      setSelected(
                                        checked
                                          ? [...selected, key]
                                          : selected.filter((id) => id !== key)
                                      )
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <div className={styles.name}>
                                  <span className={styles.glyph}>
                                    <Icon
                                      name={icons[resource.kind]}
                                      label={
                                        resourceKinds.find((kind) => kind.value === resource.kind)
                                          ?.label
                                      }
                                    />
                                  </span>
                                  {resource.kind === "folder" ? (
                                    <Button
                                      variant="link"
                                      onClick={() =>
                                        navigate(`${path === "/" ? "" : path}/${resource.name}`)
                                      }
                                    >
                                      {resource.name}
                                    </Button>
                                  ) : (
                                    <code>{resource.name}</code>
                                  )}
                                  {resource.kind !== "folder" && (
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      icon={isExpanded ? "chev-down" : "chev-right"}
                                      iconOnly
                                      aria-expanded={isExpanded}
                                      onClick={() =>
                                        setExpanded(
                                          isExpanded
                                            ? expanded.filter((id) => id !== key)
                                            : [...expanded, key]
                                        )
                                      }
                                    >{`${isExpanded ? "Collapse" : "Expand"} ${resource.name}`}</Button>
                                  )}
                                </div>
                                {resource.kind === "secret" &&
                                  (resource.tags.length > 0 ||
                                    resource.override !== undefined ||
                                    resource.managedBy) && (
                                    <div className={styles.annotations}>
                                      {[
                                        ...resource.tags,
                                        ...(resource.override !== undefined
                                          ? ["Personal override"]
                                          : []),
                                        ...(resource.managedBy ? ["Managed"] : [])
                                      ].join(", ")}
                                    </div>
                                  )}
                              </TableCell>
                              {multiple ? (
                                visibleEnvironments.map((environment) => {
                                  const entry = entries.find(
                                    (item) => item.environment === environment.value
                                  );
                                  const status = resourceStatus(entry);
                                  return (
                                    <TableCell key={environment.value}>
                                      <span
                                        title={`${environment.label}: ${status.label}`}
                                        className={styles.status}
                                      >
                                        <Icon name={status.icon} />
                                        {status.label}
                                      </span>
                                    </TableCell>
                                  );
                                })
                              ) : (
                                <TableCell>{valueCell(resource)}</TableCell>
                              )}
                              <TableCell>
                                {multiple ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled
                                    title="Expand the resource to edit a specific environment."
                                  >
                                    Edit
                                  </Button>
                                ) : (
                                  rowActions(resource)
                                )}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow>
                                <TableCell />
                                <TableCell colSpan={visibleEnvironments.length + 2}>
                                  <div className={styles.details}>
                                    {entries.map((entry) => (
                                      <div key={entry.id} className={styles.detail}>
                                        <strong>
                                          {
                                            environments.find(
                                              (environment) =>
                                                environment.value === entry.environment
                                            )?.label
                                          }
                                        </strong>
                                        {valueCell(entry)}
                                        {rowActions(entry)}
                                        <span className={styles.muted}>
                                          Created {new Date(entry.createdAt).toLocaleDateString()},
                                          Edited {new Date(entry.updatedAt).toLocaleDateString()}
                                        </span>
                                        {entry.kind === "secret" && (
                                          <>
                                            <span>{entry.comment || "No comment"}</span>
                                            {entry.override !== undefined && (
                                              <span className={styles.muted}>
                                                Personal override exists. Its editor is unavailable
                                                in this phase.
                                              </span>
                                            )}
                                          </>
                                        )}
                                        {entry.kind === "import" && !entry.revoked && (
                                          <span className={styles.muted}>
                                            Imported keys: {Object.keys(entry.keys).join(", ")}.
                                            Import resolution and precedence are unavailable in this
                                            phase.
                                          </span>
                                        )}
                                        {entry.kind === "rotation" && (
                                          <span className={styles.muted}>
                                            Managed keys: {entry.managedKeys.join(", ")}
                                          </span>
                                        )}
                                        {entry.kind === "honey" && (
                                          <span className={styles.muted}>
                                            {entry.events.join(", ") || "No detection events"}
                                          </span>
                                        )}
                                        {entry.kind === "proxy" && (
                                          <span className={styles.muted}>
                                            Template: {entry.template}
                                          </span>
                                        )}
                                        <Button variant="ghost" disabled title={deferred}>
                                          {entry.kind === "secret"
                                            ? "History and Annotations"
                                            : "Resource Operations"}
                                        </Button>
                                      </div>
                                    ))}
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
            {!unavailable && (
              <div className={styles.footer}>
                <span className={styles.muted}>
                  {resourceKinds
                    .map((kind) => {
                      const count = filtered.filter(
                        ([, entries]) => entries[0].kind === kind.value
                      ).length;
                      return count ? `${count} ${kind.label.toLowerCase()}` : "";
                    })
                    .filter(Boolean)
                    .join(", ") || "0 resources"}
                </span>
                <Pagination
                  page={currentPage}
                  total={filtered.length}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 20, 50]}
                  onPageChange={(value) => {
                    setPage(value);
                    setSelected([]);
                  }}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(1);
                    setSelected([]);
                  }}
                />
              </div>
            )}
          </div>
        </PageGutter>
      </AppInset>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => {
          if (!open) closeDraft();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draft?.resource ? "Edit" : "Add"} {draft?.kind === "folder" ? "Folder" : "Secret"}
            </DialogTitle>
            <DialogDescription>
              {project} /{" "}
              {draft?.resource
                ? draft.environment
                : visibleEnvironments.map((environment) => environment.label).join(", ")}{" "}
              / {path}. Changes affect local demo data only.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              id="secret-demo-editor"
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <Field
                label={draft.kind === "secret" ? "Key" : "Folder Name"}
                error={validation || undefined}
              >
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
            </form>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDraft}>
              Cancel
            </Button>
            <Button form="secret-demo-editor" type="submit">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={discard} onOpenChange={setDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard Changes?</DialogTitle>
            <DialogDescription>
              Your unsaved secret or folder changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscard(false)}>
              Keep Editing
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
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This removes the local {deleting?.kind}
              {deleting?.kind === "folder" ? " and all resources inside it" : ""} from{" "}
              {deleting?.environment} at {path}. This cannot be undone. Dependency previews are not
              available in this phase.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                const folderPath = `${path === "/" ? "" : path}/${deleting.name}`;
                setResources((current) =>
                  current.filter(
                    (resource) =>
                      resource.id !== deleting.id &&
                      !(
                        deleting.kind === "folder" &&
                        resource.project === project &&
                        resource.environment === deleting.environment &&
                        (resource.path === folderPath || resource.path.startsWith(`${folderPath}/`))
                      )
                  )
                );
                setNotice(`Deleted ${deleting.name} from local demo data.`);
                setDeleting(undefined);
                setSelected([]);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function Secrets() {
  const scenario = useSecretsScenario();
  return <Overview key={scenario} scenario={scenario} />;
}
