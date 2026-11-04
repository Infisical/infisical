import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { GitCommitIcon } from "lucide-react";

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
import type { ToastItem } from "@app/components/v4/ui/toast-stack";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectVersion } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useResourceApply } from "./bridge/apply";
import { toPendingChanges } from "./bridge/commit";
import { useScopeSecrets } from "./bridge/scopes";
import { useSecretValues } from "./bridge/values";
import { buildResources, valueKey } from "./bridge/view-model";
import {
  readableValue,
  type Resource,
  resourceKey,
  type ResourceKind,
  scopeMatches,
  type Secret,
  setEnvironmentOptions
} from "./secrets-model";
import {
  type PendingChange,
  pendingIn,
  pendingMarks,
  pendingTarget,
  stagePending,
  withPending
} from "./secrets/batch/pending";
import { commitLabel, ReviewSheet } from "./secrets/batch/review-sheet";
import { BulkTagDialog } from "./secrets/bulk/bulk-tag-dialog";
import { type CopySecretsInvocation, CopySecretsSheet } from "./secrets/bulk/copy-secrets-sheet";
import { MoveSecretsDialog } from "./secrets/bulk/move-secrets-dialog";
import { CommitHistorySheet } from "./secrets/commits/commit-history-sheet";
import type { LocalCommit } from "./secrets/commits/commits-model";
import { addFlows, type FlowFeedback, FlowToasts, type NewResource } from "./secrets/flows";
import { childPath } from "./secrets/flows/shared";
import {
  type ImportSecretsRequest,
  ImportSecretsSheet
} from "./secrets/import-secrets/import-secrets-sheet";
import { SecretDropzone } from "./secrets/import-secrets/secret-dropzone";
import { NEXT_PHASE, ROW_ACTION_SLOTS, type RowContext } from "./secrets/overview-cells";
import { FolderRow, ImportRow, KindRow } from "./secrets/resource-rows";
import { DynamicSecretActions } from "./secrets/row-actions/dynamic-secret-actions";
import { EditFolderDialog } from "./secrets/row-actions/edit-folder-dialog";
import { FolderActions } from "./secrets/row-actions/folder-actions";
import { HoneyTokenActions } from "./secrets/row-actions/honey-token-actions";
import { ImportActions } from "./secrets/row-actions/import-actions";
import { ProxiedServiceActions } from "./secrets/row-actions/proxied-service-actions";
import { RotationActions } from "./secrets/row-actions/rotation-actions";
import type { RowAction } from "./secrets/row-actions/types";
import { type ReferenceSource, ReferenceSourceProvider } from "./secrets/secret-references";
import { SecretRow, type SecretRowHandlers } from "./secrets/secret-row";
import { CreateSecretSyncSheet } from "./secrets/secret-sync/create-secret-sync-sheet";
import { SecretSyncStatusBadge } from "./secrets/secret-sync/secret-sync-status-badge";
import type { LocalSecretSync } from "./secrets/secret-sync/sync-model";
import {
  AddNewMenu,
  ExportMenu,
  FolderBreadcrumbBar,
  QuickAddRow,
  ResourceCount,
  ResourceFilterMenu
} from "./secrets/toolbar";

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

const ROUTE = "/v4/organizations/$orgId/projects/secret-management/$projectId/overview";
const filterRowTypes: Record<ResourceKind, string> = {
  secret: "secret",
  folder: "folder",
  dynamic: "dynamic",
  rotation: "rotation",
  import: "import",
  honey: "honeyToken",
  proxy: "proxiedService"
};
const parseList = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
const errorText = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Please try again.";

export const OverviewPage = () => {
  const { projectId } = useParams({ from: ROUTE });
  const search = useSearch({ from: ROUTE });
  const routerNavigate = useNavigate({ from: ROUTE });
  const adapter = useV4Adapter("secrets");
  const session = useV4Session();
  const projectQuery = adapter.useProject(projectId);
  const tagList = adapter.useTags(projectId).data ?? [];
  const folderTree = adapter.useProjectFolders(projectId).data;
  const createCommit = adapter.useCreateCommit();
  const deleteEnvironmentMutation = adapter.useDeleteEnvironment();
  const project = projectId;
  const path = search.secretPath || "/";
  const types = parseList(search.filterBy).flatMap((entry) =>
    (Object.keys(filterRowTypes) as ResourceKind[]).filter((kind) => filterRowTypes[kind] === entry)
  );
  const tags = parseList(search.tags);
  const [query, setQuery] = useState(search.search);
  const [debounced, setDebounced] = useState(search.search);
  const [sort, setSort] = useState<Sort>({ field: "name", direction: "asc" });
  const [paging, setPaging] = useState({ scope: "", page: 1 });
  const [perPage, setPerPage] = useState(100);
  const [revealAll, setRevealAll] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingFolder, setEditingFolder] = useState<Of<"folder">>();
  const [deletingFolder, setDeletingFolder] = useState<Of<"folder">>();
  const [deleting, setDeleting] = useState<Editable[]>();
  const [notice, setNotice] = useState("");
  const [flow, setFlow] = useState<{
    kind: ResourceKind;
    session: number;
    initial?: { environments?: string[]; name?: string };
  }>();
  const [flowOpen, setFlowOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [rowAction, setRowAction] = useState<RowAction>();
  const [importRequest, setImportRequest] = useState<ImportSecretsRequest>();
  const [copyInvocation, setCopyInvocation] = useState<CopySecretsInvocation>();
  const [tagging, setTagging] = useState<Secret[]>();
  const [moving, setMoving] = useState<Resource[]>();
  const [commitEnvironment, setCommitEnvironment] = useState<{ value: string; label: string }>();
  const [syncOpen, setSyncOpen] = useState(false);
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [deletingEnvironment, setDeletingEnvironment] = useState<{
    value: string;
    label: string;
  }>();
  const revealed = useRef("");
  const searchInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const projectEnvironments = (projectQuery.data?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  setEnvironmentOptions(projectEnvironments);
  const environmentIds = search.environments.filter((slug) =>
    projectEnvironments.some((environment) => environment.value === slug)
  );
  const visibleEnvironments = projectEnvironments.filter(
    (environment) => !environmentIds.length || environmentIds.includes(environment.value)
  );
  const single = visibleEnvironments.length === 1;
  const activeEnvironment = visibleEnvironments[0]?.value ?? "";
  const pageScope = JSON.stringify([path, environmentIds, debounced, types, tags, sort, perPage]);
  const page = paging.scope === pageScope ? paging.page : 1;
  const setPage = (next: number) => setPaging({ scope: pageScope, page: next });
  const include = (kind: ResourceKind) => !types.length || types.includes(kind);
  const overview = adapter.useOverview({
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
  const valueStore = useSecretValues(projectId);
  const wide = Boolean(
    importRequest || copyInvocation || moving || flowOpen || rowAction || syncOpen
  );
  const breadthScopes = [
    ...(overview.data?.imports ?? [])
      .filter((entry) => !entry.importEnv.projectId || entry.importEnv.projectId === projectId)
      .map((entry) => ({ environment: entry.importEnv.slug, path: entry.importPath })),
    ...(wide
      ? Object.values(folderTree ?? {}).flatMap((environment) =>
          environment.folders.map((folder) => ({
            environment: environment.slug,
            path: folder.path
          }))
        )
      : [])
  ].filter(
    (scope, index, all) =>
      !(
        scope.path === path &&
        visibleEnvironments.some((entry) => entry.value === scope.environment)
      ) &&
      all.findIndex(
        (entry) => entry.environment === scope.environment && entry.path === scope.path
      ) === index
  );
  const breadth = useScopeSecrets(projectId, breadthScopes);
  const resources = buildResources({
    projectId,
    path,
    overview: overview.data,
    folderTree,
    scopes: breadth.scopes,
    values: valueStore.values
  });
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const runApply = useResourceApply({
    projectId,
    projectSlug: projectQuery.data?.slug ?? projectId,
    tags: tagList
  });
  const pushToast = (item: Omit<ToastItem, "id">) =>
    setToasts((current) => [...current, { ...item, id: crypto.randomUUID() }]);
  const setResources = (update: (current: Resource[]) => Resource[], feedback?: FlowFeedback) => {
    const before = resourcesRef.current;
    const after = update([...before]);
    runApply(before, after).then(
      () => {
        if (feedback) pushToast({ tone: "ok", ...feedback });
      },
      (error: unknown) =>
        pushToast({
          tone: "bad",
          title: feedback ? `Could not finish: ${feedback.title}` : "The change failed",
          description: errorText(error)
        })
    );
  };
  const commits: LocalCommit[] = [];
  const syncs: LocalSecretSync[] = [];
  const noEnvironments = projectQuery.isPending ? false : !projectEnvironments.length;
  const legacy = Boolean(projectQuery.data) && projectQuery.data?.version !== ProjectVersion.V3;
  const failed = Boolean(overview.error);
  const loading =
    (overview.isPending || projectQuery.isPending) && !noEnvironments && !legacy && !failed;
  const unavailable = loading || noEnvironments || legacy || failed;
  let writeBlock: string | undefined;
  if (unavailable) writeBlock = "Resources are not available right now";
  const overlayOpen = Boolean(
    importRequest ||
    copyInvocation ||
    tagging ||
    moving ||
    commitEnvironment ||
    syncOpen ||
    reviewOpen ||
    deletingEnvironment
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
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
        rowAction ||
        overlayOpen
      )
        return;
      if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
      if (!root.current?.getClientRects().length) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, [editingFolder, deletingFolder, deleting, flowOpen, rowAction, overlayOpen]);

  const updateSearch = (patch: Partial<typeof search>) =>
    routerNavigate({ search: (previous) => ({ ...previous, ...patch }) });
  const setEnvironmentIds = (value: string[] | ((current: string[]) => string[])) =>
    updateSearch({
      environments: typeof value === "function" ? value(environmentIds) : value
    });
  const setTypes = (value: ResourceKind[]) =>
    updateSearch({ filterBy: value.map((kind) => filterRowTypes[kind]).join(",") || undefined });
  const setTags = (value: string[]) => updateSearch({ tags: value.join(",") || undefined });
  const resetView = () => {
    setPage(1);
    setSelected([]);
    setNotice("");
    setRecent([]);
  };
  const navigate = (nextPath: string) => {
    setQuery("");
    setDebounced("");
    resetView();
    updateSearch({ secretPath: nextPath, search: "" });
  };
  const pendingHere = single
    ? pendingIn(pending, { project, environment: activeEnvironment, path })
    : [];
  const pageIds = new Set(
    [
      ...(overview.data?.imports ?? []),
      ...(overview.data?.folders ?? []),
      ...(overview.data?.dynamicSecrets ?? []),
      ...(overview.data?.secretRotations ?? []),
      ...(overview.data?.honeyTokens ?? []),
      ...(overview.data?.proxiedServices ?? []),
      ...(overview.data?.secrets ?? [])
    ].map((entry) => entry.id)
  );
  const pendingIds = new Set(pendingHere.map((change) => pendingTarget(change).id));
  const shown = pendingHere.length ? withPending(resources, pendingHere) : resources;
  const scoped = shown.filter(
    (resource) =>
      (pageIds.has(resource.id) || pendingIds.has(resource.id)) &&
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
  const totals: Record<ResourceKind, number> = {
    import: overview.data?.totalImportCount ?? 0,
    folder: overview.data?.totalFolderCount ?? 0,
    dynamic: overview.data?.totalDynamicSecretCount ?? 0,
    rotation: overview.data?.totalSecretRotationCount ?? 0,
    honey: overview.data?.totalHoneyTokenCount ?? 0,
    proxy: overview.data?.totalProxiedServiceCount ?? 0,
    secret: overview.data?.totalSecretCount ?? 0
  };
  const totalCount = Math.max(overview.data?.totalCount ?? 0, ordered.length);
  const pageCount = Math.max(1, Math.ceil(totalCount / perPage));
  const currentPage = Math.min(page, pageCount);
  const windowRows = ordered;
  const isLastPage = currentPage === pageCount;
  useEffect(() => {
    const signature = recent.join("|");
    if (!signature || revealed.current === signature) return;
    if (!ordered.some(([key]) => recent.includes(key))) return;
    revealed.current = signature;
    root.current
      ?.querySelector('tbody tr[data-state="selected"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [recent, ordered]);
  const isFiltered = Boolean(query.trim() || types.length || tags.length);
  const tagOptions = tagList.map((tag) => tag.slug).sort();
  const selectableOnPage = windowRows
    .filter(
      ([, entries]) =>
        selectableKinds.includes(entries[0].kind) && (single || entries[0].kind !== "rotation")
    )
    .map(([key]) => key);
  const selectedEntries = scoped.filter((resource) => selected.includes(resourceKey(resource)));
  const report = (message: string) => setNotice(message);
  const stage = (shownResource: Secret | Of<"folder">, next: Secret | Of<"folder">) => {
    setPending((current) => stagePending(current, shownResource, next, resources));
    setSelected([]);
  };
  const commitChanges = (changes: PendingChange[], message: string) => {
    if (!changes.length) return;
    const [first] = changes;
    const target = pendingTarget(first);
    const past = { create: "created", update: "updated", delete: "deleted" }[first.type];
    const title =
      changes.length === 1
        ? `${target.kind === "secret" ? "Secret" : "Folder"} "${target.name}" ${past}`
        : `${changes.length} changes committed`;
    createCommit
      .mutateAsync({
        projectId,
        environment: target.environment,
        secretPath: target.path,
        pendingChanges: toPendingChanges(changes, tagList),
        message: message.trim() || title
      })
      .then(
        (response) => {
          setPending((current) => current.filter((change) => !changes.includes(change)));
          setReviewOpen(false);
          setNotice("");
          pushToast(
            response.approval
              ? {
                  tone: "neutral",
                  title: "Change request opened",
                  description:
                    "An approval policy covers this folder, so the changes wait for review."
                }
              : { tone: "ok", title }
          );
        },
        (error: unknown) =>
          pushToast({
            tone: "bad",
            title: "Failed to commit changes",
            description: errorText(error)
          })
      );
  };
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
    onAction: setRowAction,
    pending: pendingMarks(pendingHere),
    selectionDisabled: pendingHere.length > 0,
    onSavePending: (id) =>
      commitChanges(
        pendingHere.filter((change) => pendingTarget(change).id === id),
        ""
      ),
    onRevertPending: (id) =>
      setPending((current) => current.filter((change) => pendingTarget(change).id !== id))
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

  const insert = (created: NewResource[], feedback: FlowFeedback) => {
    const timestamp = new Date().toISOString();
    setResources(
      (current) => [
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
      ],
      feedback
    );
    setNotice("");
    setRecent([
      ...new Set(
        created
          .filter((resource) => resource.project === project && resource.path === path)
          .map(resourceKey)
      )
    ]);
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
      { title: `Created ${name}` }
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
          .map(
            (target) =>
              projectEnvironments.find((entry) => entry.value === target.environment)?.label
          )
          .join(", ")}.`
      });
      return;
    }
    if (single) {
      stage(folder, { ...folder, name, description });
      return;
    }
    const timestamp = new Date().toISOString();
    const prefix = path === "/" ? "" : path;
    const oldPath = `${prefix}/${folder.name}`;
    setResources(
      (current) =>
        current.map((resource): Resource => {
          const target = targets.find((entry) => entry.id === resource.id);
          if (target) return { ...target, name, description, updatedAt: timestamp };
          if (
            resource.project === project &&
            targets.some((entry) => entry.environment === resource.environment) &&
            (resource.path === oldPath || resource.path.startsWith(`${oldPath}/`))
          )
            return {
              ...resource,
              path: `${prefix}/${name}${resource.path.slice(oldPath.length)}`
            };
          return resource;
        }),
      {
        title: single
          ? `Folder "${name}" updated`
          : "Successfully renamed folder across environments"
      }
    );
    setNotice("");
  };
  const remove = (selectedTargets: Editable[], title?: string) => {
    const targets = selectedTargets.map(
      (target) => (resources.find((resource) => resource.id === target.id) as Editable) ?? target
    );
    setPending((current) =>
      current.filter((change) => !targets.some((target) => target.id === pendingTarget(change).id))
    );
    setResources(
      (current) =>
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
        ),
      {
        title: title ?? `Deleted ${[...new Set(targets.map((target) => target.name))].join(", ")}`
      }
    );
    setNotice("");
    setDeleting(undefined);
    setSelected([]);
  };
  const deleteEnvironment = (environment: string) => {
    setDeletingEnvironment(undefined);
    const target = projectQuery.data?.environments.find((entry) => entry.slug === environment);
    if (!target) return;
    deleteEnvironmentMutation.mutateAsync({ projectId, id: target.id }).then(
      () => pushToast({ tone: "ok", title: "Successfully removed environment" }),
      (error: unknown) =>
        pushToast({
          tone: "bad",
          title: "Failed to remove environment",
          description: errorText(error)
        })
    );
    setPending((current) =>
      current.filter(
        (change) =>
          pendingTarget(change).project !== project ||
          pendingTarget(change).environment !== environment
      )
    );
    setEnvironmentIds((current) => current.filter((entry) => entry !== environment));
    resetView();
  };
  const deleteFolder = (folder: Of<"folder">) => {
    setDeletingFolder(undefined);
    remove(
      folderTargets(folder),
      single ? `Folder "${folder.name}" deleted` : "Successfully deleted folder"
    );
  };
  const envSecrets = (environment: string) => {
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
    return [...local, ...inherited].filter((secret) => {
      if (seen.has(secret.name) || secret.value.status === "unreadable") return false;
      seen.add(secret.name);
      return true;
    });
  };
  const loadedValue = (values: Record<string, unknown>, secret: Secret) => {
    const value =
      readableValue(secret) ??
      values[valueKey(secret.environment, secret.path, secret.name, false, secret.version)];
    return typeof value === "string" ? value : undefined;
  };
  const exportEnv = async (environment: string, action: "clipboard" | "download") => {
    const secrets = envSecrets(environment);
    const values = await valueStore.loader.ensure(secrets);
    const text = `${secrets
      .flatMap((secret) => {
        const value = loadedValue(values, secret);
        return value === undefined ? [] : [`${secret.name}=${JSON.stringify(value)}`];
      })
      .join("\n")}\n`;
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
      setNotice(`Downloaded ${environment}.env.`);
    } catch {
      setNotice("Failed to export secrets. Please try again later.");
    }
  };
  const exportBlock = (() => {
    if (!single) return "Select a single environment to export secrets";
    if (!envSecrets(activeEnvironment).length) return "No secrets in this folder";
    return undefined;
  })();
  const sortLabel = sortOptions.find(
    (option) => option.field === sort.field && option.direction === sort.direction
  )?.label;
  const colSpan = visibleEnvironments.length + 3;
  const commitCount = commits.filter(
    (commit) =>
      commit.project === project && commit.environment === activeEnvironment && commit.path === path
  ).length;
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
    onCopySecret: (secret) =>
      setCopyInvocation({
        origin: "row",
        sourceEnvironmentSlug: secret.environment,
        sourcePath: secret.path,
        secrets: [{ id: secret.id, name: secret.name, path: secret.path }]
      }),
    copySecretBlock: pendingHere.length ? "Discard pending changes first" : undefined,
    onUpdate: (secret, { value, ...patch }, feedback) => {
      if (single && !("reminder" in patch || "override" in patch || "versions" in patch)) {
        stage(secret, {
          ...secret,
          ...patch,
          ...(value === undefined ? {} : { value: { status: "present", value } })
        });
        return;
      }
      setResources(
        (current) =>
          current.map((resource): Resource => {
            if (resource.id !== secret.id || resource.kind !== "secret") return resource;
            if (value === undefined) return { ...resource, ...patch };
            return { ...resource, ...patch, value: { status: "present", value } };
          }),
        feedback
      );
      setNotice("");
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
  const selectedSecrets = selectedEntries.filter(
    (entry): entry is Secret => entry.kind === "secret"
  );
  const selectedFolders = selectedEntries.filter(
    (entry): entry is Of<"folder"> => entry.kind === "folder"
  );
  const rotationsSelected = selectedEntries.some((entry) => entry.kind === "rotation");
  const honeySelected = selectedSecrets.some((secret) => secret.honeyToken);
  const managedSelected = selectedSecrets.some((secret) => secret.managedBy || secret.honeyToken);
  const deleteBlocked = rotationsSelected || managedSelected;
  let moveBlock: string | undefined;
  if (honeySelected) moveBlock = "Moving honey tokens is not supported";
  else if (
    !selectedFolders.length &&
    !rotationsSelected &&
    selectedSecrets.length > 0 &&
    selectedSecrets.every((secret) => secret.managedBy || secret.honeyToken)
  )
    moveBlock = "Rotated secrets are managed by their secret rotation. Move the rotation instead.";
  let bulkCopyBlock: string | undefined;
  if (honeySelected) bulkCopyBlock = "Honey token secrets cannot be copied";
  else if (rotationsSelected || managedSelected) bulkCopyBlock = "Rotated secrets cannot be copied";
  else if (!selectedSecrets.length && !selectedFolders.length) bulkCopyBlock = "Nothing to copy";
  const clipboardBlock =
    !selectedSecrets.length ||
    selectedFolders.length > 0 ||
    rotationsSelected ||
    selectedSecrets.some((secret) => secret.value.status === "unreadable");
  const groupByEnvironment = <T extends Resource, V>(entries: T[], map: (entry: T) => V) =>
    entries.reduce<Record<string, V[]>>(
      (byEnvironment, entry) => ({
        ...byEnvironment,
        [entry.environment]: [...(byEnvironment[entry.environment] ?? []), map(entry)]
      }),
      {}
    );
  const copySelectionToClipboard = async () => {
    if (selectedSecrets.some((secret) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(secret.name))) {
      pushToast({
        tone: "bad",
        title: "Cannot copy secrets as .env",
        description:
          "Some selected secret names aren’t compatible with .env format. Names must contain only letters, numbers, and underscores, and cannot start with a number. Nothing was copied."
      });
      return;
    }
    const values = await valueStore.loader.ensure(selectedSecrets);
    const text = Object.entries(groupByEnvironment(selectedSecrets, (secret) => secret))
      .map(([environment, secrets]) => {
        const lines = secrets.map(
          (secret) =>
            `${secret.name}="${(loadedValue(values, secret) ?? "")
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')
              .replace(/\r/g, "\\r")
              .replace(/\n/g, "\\n")}"`
        );
        if (!single) lines.unshift(`# ${environment}`);
        return lines.join("\n");
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ tone: "ok", title: "Selected secrets copied to clipboard" });
    } catch {
      pushToast({ tone: "bad", title: "Failed to copy selected secrets to clipboard" });
    }
  };
  const clearFilters = () => {
    setQuery("");
    setDebounced("");
    updateSearch({ filterBy: undefined, tags: undefined, search: "" });
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
      <SecretDropzone
        disabledReason={writeBlock}
        onFile={(file) => setImportRequest({ step: "upload", file })}
      >
        <div className={styles.dropPad}>
          <EmptyState
            icon="upload"
            title="This table is empty"
            description="Drag and drop a secrets file here"
            actions={
              <>
                {gate(
                  writeBlock,
                  <Button
                    variant="outline"
                    icon="upload"
                    disabled={Boolean(writeBlock)}
                    onClick={() => setImportRequest({ step: "upload" })}
                  >
                    Upload secrets
                  </Button>
                )}
                {gate(
                  writeBlock,
                  <Button
                    variant="outline"
                    icon="copy"
                    disabled={Boolean(writeBlock)}
                    onClick={() => setImportRequest({ step: "paste" })}
                  >
                    Paste secrets
                  </Button>
                )}
                {gate(
                  writeBlock,
                  <Button
                    icon="plus"
                    disabled={Boolean(writeBlock)}
                    onClick={() => openFlow("secret")}
                  >
                    Add a new secret
                  </Button>
                )}
              </>
            }
          />
        </div>
      </SecretDropzone>
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
            NEXT_PHASE,
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
          actions={gate(NEXT_PHASE, <Button disabled>Upgrade project</Button>)}
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
        <DropdownMenuItem onSelect={() => setCommitEnvironment(environment)}>
          <Icon icon={GitCommitIcon} />
          View commit history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(writeBlock)}
          description={writeBlock}
          onSelect={() => setDeletingEnvironment(environment)}
        >
          <Icon name="trash" />
          Delete environment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const referenceSource: ReferenceSource = {
    project,
    environments: projectEnvironments,
    resources,
    onFocusReference: ({ environment, path: nextPath, key }) => {
      if (nextPath !== undefined && nextPath !== path) navigate(nextPath);
      if (environment) setEnvironmentIds([environment]);
      setQuery(key ?? (nextPath !== undefined && nextPath !== path ? "" : query));
    },
    report: (message) => pushToast({ tone: "bad", title: message })
  };
  return valueStore.provider(
    <ReferenceSourceProvider value={referenceSource}>
      <div ref={root}>
        <div>
          <div>
            <div className={styles.page}>
              <PageHeader
                size="md"
                title={
                  session.projects.find((entry) => entry.id === projectId)?.name ??
                  projectQuery.data?.name ??
                  projectId
                }
                mono
              />
              <div className={styles.toolbar}>
                <div className={styles.envPicker}>
                  <MultiSelect
                    label="Environments"
                    options={noEnvironments ? [] : projectEnvironments}
                    value={noEnvironments ? [] : environmentIds}
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
                    ref={searchInput}
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
                  secretCount={single ? envSecrets(activeEnvironment).length : 0}
                  onExport={(action) => exportEnv(activeEnvironment, action)}
                />
                <AddNewMenu
                  writeBlock={writeBlock}
                  single={single}
                  available={Object.fromEntries(Object.keys(addFlows).map((kind) => [kind, true]))}
                  copyBlock={
                    pendingHere.length ? "Commit or discard pending changes first" : undefined
                  }
                  onAdd={(kind) => openFlow(kind)}
                  onUpload={() => setImportRequest({ step: "upload" })}
                  onCopySecrets={() =>
                    setCopyInvocation({
                      origin: "toolbar",
                      sourcePath: path,
                      sourceEnvironmentSlug: single ? activeEnvironment : ""
                    })
                  }
                  onAddSync={() => setSyncOpen(true)}
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
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    icon="git"
                                    onClick={() => setCommitEnvironment(visibleEnvironments[0])}
                                  >
                                    <span className={styles.headLabel}>
                                      {`${commitCount} commit${commitCount === 1 ? "" : "s"}`}
                                    </span>
                                  </Button>
                                  <SecretSyncStatusBadge
                                    syncs={syncs}
                                    project={project}
                                    environments={visibleEnvironments.map(
                                      (environment) => environment.value
                                    )}
                                    path={path}
                                  />
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
                          <TableActionsHead slots={ROW_ACTION_SLOTS} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading &&
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
                        {!loading && totalCount === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={colSpan}
                              className={styles.emptyCell}
                              data-dropzone={!isFiltered || undefined}
                            >
                              {emptyState}
                            </TableCell>
                          </TableRow>
                        )}
                        {!loading &&
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
                            colSpan={(single ? 1 : visibleEnvironments.length) + 1}
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
                            onQueue={
                              single
                                ? (key, value) => {
                                    const timestamp = new Date().toISOString();
                                    setPending((current) => [
                                      ...current,
                                      {
                                        id: crypto.randomUUID(),
                                        type: "create",
                                        next: {
                                          kind: "secret",
                                          id: crypto.randomUUID(),
                                          project,
                                          environment: activeEnvironment,
                                          path,
                                          name: key,
                                          value: { status: "present", value },
                                          version: 1,
                                          comment: "",
                                          tags: [],
                                          metadata: [],
                                          createdAt: timestamp,
                                          updatedAt: timestamp
                                        }
                                      }
                                    ]);
                                    setSelected([]);
                                  }
                                : undefined
                            }
                            onPasteSecrets={(parsed) => setImportRequest({ step: "paste", parsed })}
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
          </div>
          <div
            className={styles.fabDock}
            data-active={
              selected.length > 0 || (pendingHere.length > 0 && !reviewOpen) || undefined
            }
          >
            {pendingHere.length ? (
              <FloatingActionBar
                placement="contained"
                label="Pending change actions"
                count={reviewOpen ? 0 : pendingHere.length}
                noun={pendingHere.length === 1 ? "pending change" : "pending changes"}
                onClear={() =>
                  setPending((current) => current.filter((change) => !pendingHere.includes(change)))
                }
                actions={[
                  { label: "Review", icon: "eye", onClick: () => setReviewOpen(true) },
                  {
                    label: commitLabel(pendingHere.length),
                    icon: "check",
                    disabled: Boolean(writeBlock),
                    onClick: () => commitChanges(pendingHere, "")
                  }
                ]}
              />
            ) : (
              <FloatingActionBar
                placement="contained"
                count={selected.length}
                total={selectableOnPage.length}
                onSelectAll={() => setSelected(selectableOnPage)}
                onClear={() => setSelected([])}
                noun="resources"
                actions={[
                  {
                    label: "Add tags",
                    icon: "plus",
                    disabled: Boolean(writeBlock) || !selectedSecrets.length,
                    onClick: () => setTagging(selectedSecrets)
                  },
                  {
                    label: "Move",
                    icon: "folder",
                    disabled: Boolean(writeBlock || moveBlock),
                    onClick: () => setMoving(selectedEntries)
                  },
                  {
                    label: "Copy to clipboard",
                    icon: "copy",
                    disabled: Boolean(clipboardBlock),
                    onClick: copySelectionToClipboard
                  },
                  {
                    label: "Delete",
                    icon: "trash",
                    danger: true,
                    disabled: Boolean(writeBlock) || !deletable.length || deleteBlocked,
                    onClick: () => setDeleting(deletable)
                  }
                ]}
                moreActions={[
                  {
                    label: "Copy to new source",
                    icon: "copy",
                    disabled: Boolean(bulkCopyBlock),
                    onClick: () =>
                      setCopyInvocation({
                        origin: "bulk",
                        sourcePath: path,
                        selectedSecretCount: selectedSecretNames.length,
                        sourceEnvironmentSlug: single ? activeEnvironment : undefined,
                        secretsByEnvironment: groupByEnvironment(selectedSecrets, (secret) => ({
                          id: secret.id,
                          name: secret.name,
                          path: secret.path,
                          isRotated: Boolean(secret.managedBy),
                          isHoneyToken: Boolean(secret.honeyToken)
                        })),
                        folderNames: [...new Set(selectedFolders.map((folder) => folder.name))],
                        foldersByEnvironment: groupByEnvironment(selectedFolders, (folder) => ({
                          path: childPath(path, folder.name)
                        }))
                      })
                  }
                ]}
              />
            )}
          </div>
        </div>
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
            scope: { project, path, environments: projectEnvironments, visibleEnvironments },
            resources,
            onApply: (update: (current: Resource[]) => Resource[], feedback: FlowFeedback) => {
              setResources(update, feedback);
              setNotice("");
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
              <ImportSecretsSheet
                {...host}
                request={importRequest}
                onClose={() => setImportRequest(undefined)}
                onComplete={(targets) => {
                  if (
                    !environmentIds.length ||
                    targets.every((entry) => environmentIds.includes(entry))
                  )
                    return;
                  setEnvironmentIds([...new Set([...environmentIds, ...targets])]);
                }}
              />
              <CopySecretsSheet
                {...host}
                invocation={copyInvocation}
                onClose={() => setCopyInvocation(undefined)}
                onCompleted={() => {
                  if (copyInvocation?.origin === "bulk") setSelected([]);
                }}
              />
              <BulkTagDialog
                {...host}
                targets={tagging}
                onClose={() => setTagging(undefined)}
                onCompleted={() => setSelected([])}
              />
              <MoveSecretsDialog
                {...host}
                targets={moving}
                onClose={() => setMoving(undefined)}
                onCompleted={() => setSelected([])}
              />
              <CommitHistorySheet
                {...host}
                environment={commitEnvironment}
                commits={commits}
                onClose={() => setCommitEnvironment(undefined)}
                onRecordCommit={() => undefined}
              />
            </>
          );
        })()}
        <CreateSecretSyncSheet
          open={syncOpen}
          onOpenChange={setSyncOpen}
          scope={{ project, path, environments: projectEnvironments, visibleEnvironments }}
          initial={single ? { environment: activeEnvironment, path } : undefined}
          syncs={syncs}
          resources={resources}
          onCreate={(_sync, feedback) => {
            setSyncOpen(false);
            pushToast({ tone: "ok", ...feedback });
          }}
          onToast={(tone, feedback) => pushToast({ tone, ...feedback })}
        />
        <ReviewSheet
          open={reviewOpen}
          pending={pendingHere}
          onOpenChange={setReviewOpen}
          onDiscard={(change) =>
            setPending((current) => current.filter((entry) => entry.id !== change.id))
          }
          onCommit={(message) => commitChanges(pendingHere, message)}
        />
        <AlertDialog
          open={Boolean(deletingEnvironment)}
          onOpenChange={(open) => {
            if (!open) setDeletingEnvironment(undefined);
          }}
        >
          <AlertDialogContent tone="danger" confirmText={deletingEnvironment?.label ?? ""}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete environment</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the environment and all its secrets. This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => deletingEnvironment && deleteEnvironment(deletingEnvironment.value)}
              >
                Delete environment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {flow &&
          (() => {
            const Flow = addFlows[flow.kind];
            return (
              Flow && (
                <Flow
                  key={flow.session}
                  open={flowOpen}
                  onOpenChange={setFlowOpen}
                  scope={{ project, path, environments: projectEnvironments, visibleEnvironments }}
                  resources={resources}
                  initial={flow.initial}
                  onCreate={insert}
                  onUploadSecrets={() => setImportRequest({ step: "upload" })}
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
        {breadth.fetchers}
      </div>
    </ReferenceSourceProvider>
  );
};
