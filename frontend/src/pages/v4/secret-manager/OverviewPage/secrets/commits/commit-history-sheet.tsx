import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpWideNarrowIcon,
  MaximizeIcon,
  MinimizeIcon
} from "lucide-react";

import type {
  Commit,
  CommitWithChanges,
  RollbackPreview,
  TFolderCommitChanges
} from "@app/hooks/api/folderCommits/types";
import { wasErrorReported } from "@app/hooks/api/reactQuery";

import { errorMessage } from "../../../../access/toast";
import { copyText } from "../../../../clipboard";
import { ShowMoreFooter } from "../../../../components/show-more-footer";
import { useV4Adapter } from "../../../../data/adapters";
import type { Scope } from "../../secrets-model";
import { environmentLabel, Gate } from "../flows/shared";
import { ActionButton } from "../overview-cells";
import type { OverlayHostProps } from "../row-actions/types";
import { toCommitChange } from "./commit-changes";
import {
  type CommitResourceChange,
  type CommitSummary,
  hasHiddenState,
  sortChanges,
  summarizeChanges
} from "./commits-model";
import { ResourceChangeCard } from "./resource-change-card";

import styles from "./commits.module.css";

const MAX_RESTORE_MESSAGE_LENGTH = 256;
const PLATFORM_HINT = "Made automatically by Infisical, not by a user.";
const SYSTEM_TITLES = new Map([
  ["Secret Created", "Secret created"],
  ["Secret Updated", "Secret updated"],
  ["Secret Deleted", "Secret deleted"]
]);

type View =
  | { name: "history" }
  | { name: "details"; commitId: string }
  | { name: "restore"; commitId: string };

type ViewCommit = {
  id: string;
  message?: string | null;
  actor: string;
  actorType: string;
  createdAt: string;
  summary?: CommitSummary;
};

const toViewCommit = (commit: Commit): ViewCommit => ({
  id: commit.id,
  message: commit.message,
  actor: commit.actorMetadata?.name ?? commit.actorMetadata?.email ?? "Unknown",
  actorType: commit.actorType,
  createdAt: commit.createdAt,
  summary: commit.summary
});

const authorName = (commit: ViewCommit) =>
  commit.actorType === "platform" ? "Platform" : commit.actor;
const shortId = (id: string) => id.substring(0, 8);
const commitTitle = (message?: string | null) =>
  message ? (
    (SYSTEM_TITLES.get(message) ?? message)
  ) : (
    <span className={styles.noMessage}>No message</span>
  );
const changeAction = (change: { changeType: string; isUpdate: boolean }) => {
  if (change.changeType === "delete") return "delete";
  return change.isUpdate ? "update" : "create";
};
const plural = (count: number, singular: string) =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;

const resourceSummary = (summary: CommitSummary) =>
  [
    summary.secretCount ? plural(summary.secretCount, "secret") : "",
    summary.folderCount ? plural(summary.folderCount, "folder") : ""
  ]
    .filter(Boolean)
    .join(", ");

const changeKinds = (summary: CommitSummary) =>
  [
    { count: summary.addedCount, symbol: "+", label: "added" },
    { count: summary.updatedCount, symbol: "~", label: "updated" },
    { count: summary.deletedCount, symbol: "-", label: "deleted" }
  ].filter((kind) => kind.count > 0);

function ChangeSummary({ summary, showLabels }: { summary: CommitSummary; showLabels?: boolean }) {
  const kinds = changeKinds(summary);
  if (!kinds.length) return null;
  return (
    <span className={styles.summary}>
      {kinds.map((kind) => (
        <span key={kind.label} data-kind={kind.label}>
          <span className={styles.mono}>{`${kind.symbol}${kind.count}`}</span>
          {showLabels && ` ${kind.label}`}
        </span>
      ))}
    </span>
  );
}

function Author({ commit }: { commit: ViewCommit }) {
  return (
    <span className={styles.inlineGroup}>
      <span className={styles.truncate}>{authorName(commit)}</span>
      {commit.actorType === "platform" && (
        <Tooltip content={PLATFORM_HINT}>
          <span className={styles.hint}>
            <Icon name="info" size={12} label="About platform commits" />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

function CommitRow({ commit, onSelect }: { commit: ViewCommit; onSelect: () => void }) {
  const summary = commit.summary ?? summarizeChanges([]);
  const resources = resourceSummary(summary);
  return (
    <button type="button" className={styles.commitRow} onClick={onSelect}>
      <span className={styles.commitMain}>
        <span className={styles.commitMessage}>{commitTitle(commit.message)}</span>
        <span className={styles.meta}>
          <Author commit={commit} />
          <time dateTime={commit.createdAt}>{format(new Date(commit.createdAt), "h:mm a")}</time>
          {resources && <span>{resources}</span>}
        </span>
      </span>
      <ChangeSummary summary={summary} />
      <code className={styles.shortId}>{shortId(commit.id)}</code>
      <Icon name="chev-right" size={16} className={styles.chevron} />
    </button>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="xs" className={styles.back} onClick={onClick}>
      <Icon name="chev-left" />
      {label}
    </Button>
  );
}

function RestoreMenu({
  latest,
  block,
  onRollBack,
  onRevert,
  children
}: {
  latest: boolean;
  block?: string;
  onRollBack: () => void;
  onRevert: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <Gate reason={block}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      </Gate>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={latest}
          description={
            latest
              ? "This is already the latest commit for this folder."
              : "Discards every change made after this commit."
          }
          onSelect={onRollBack}
        >
          Roll back to this commit
        </DropdownMenuItem>
        <DropdownMenuItem description="Undoes only the changes in this commit." onSelect={onRevert}>
          Revert changes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommitMeta({
  commit,
  envName,
  path,
  onCopied
}: {
  commit: ViewCommit;
  envName: string;
  path: string;
  onCopied: () => void;
}) {
  return (
    <SheetDescription asChild>
      <div className={styles.detailMeta}>
        <span className={styles.meta}>
          <Author commit={commit} />
          <time dateTime={commit.createdAt}>
            {format(new Date(commit.createdAt), "MMM d, yyyy, h:mm a")}
          </time>
          <span className={styles.inlineGroup}>
            <code className={styles.mono}>{shortId(commit.id)}</code>
            <ActionButton
              label="Copy commit ID"
              name="copy"
              onClick={async () => {
                if (await copyText(commit.id)) onCopied();
              }}
            />
          </span>
        </span>
        <span className={styles.location}>
          <Badge tone="outline">{envName}</Badge>
          {path !== "/" && (
            <span className={styles.path}>
              <Icon name="folder" size={14} className={styles.titleIcon} />
              <MiddleTruncate mono keepEnd={24}>
                {path}
              </MiddleTruncate>
            </span>
          )}
        </span>
      </div>
    </SheetDescription>
  );
}

function ChangedCount({ count, summary }: { count: number; summary: CommitSummary }) {
  const kinds = changeKinds(summary);
  return (
    <span className={styles.changedCount}>
      <span>{`${plural(count, "resource")} ${kinds.length === 1 ? kinds[0].label : "changed"}`}</span>
      {kinds.length > 1 && <ChangeSummary summary={summary} showLabels />}
    </span>
  );
}

function ChangeCards({
  changes,
  collapsed,
  fullState,
  onToggleCollapse,
  onToggleFullState
}: {
  changes: ReturnType<typeof sortChanges>;
  collapsed: Record<string, boolean>;
  fullState: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onToggleFullState: (id: string) => void;
}) {
  return (
    <div className={styles.cards}>
      {changes.map((change) => (
        <ResourceChangeCard
          key={change.id}
          change={change}
          isCollapsed={Boolean(collapsed[change.id])}
          onToggleCollapse={() => onToggleCollapse(change.id)}
          isFullState={Boolean(fullState[change.id])}
          onToggleFullState={() => onToggleFullState(change.id)}
        />
      ))}
    </div>
  );
}

type CommitGroup = { date: string; commits: ViewCommit[] };
type RestoreFolder = { path: string; changes: CommitResourceChange[] };

const groupByDate = (commits: ViewCommit[]) =>
  commits.reduce<CommitGroup[]>((acc, commit) => {
    const date = format(new Date(commit.createdAt), "MMM d, yyyy");
    const group = acc.at(-1);
    if (group?.date === date) group.commits.push(commit);
    else acc.push({ date, commits: [commit] });
    return acc;
  }, []);

const toDetailChanges = (changes: TFolderCommitChanges[], scope: Scope) =>
  changes
    .map((change) =>
      toCommitChange(scope, {
        id: change.id,
        type: change.secretVersionId || change.secretKey ? "secret" : "folder",
        action: changeAction(change),
        name: change.secretKey ?? change.folderName ?? "Unnamed",
        versions: change.versions as unknown as { version: number }[]
      })
    )
    .filter((change): change is CommitResourceChange => change !== null);

const toRestoreFolders = (
  preview: RollbackPreview[],
  folderId: string | undefined,
  scope: Scope
): RestoreFolder[] =>
  [...preview]
    .sort((x, y) => Number(y.folderId === folderId) - Number(x.folderId === folderId))
    .map((item) => ({
      path: item.folderPath,
      changes: item.changes
        .map((change) => {
          const extra = change as typeof change & {
            secretKey?: string;
            folderName?: string;
            versions?: { version: number }[];
          };
          return toCommitChange(
            { ...scope, path: item.folderPath },
            {
              id: change.id,
              type: change.type,
              action: change.changeType === "add" ? "create" : change.changeType,
              name: (change.type === "secret" ? extra.secretKey : extra.folderName) || "Unnamed",
              versions: extra.versions,
              isRollback: true
            }
          );
        })
        .filter((change): change is CommitResourceChange => change !== null)
    }));

function HistoryToolbar({
  search,
  onSearch,
  author,
  authors,
  onAuthor,
  sort,
  onSort
}: {
  search: string;
  onSearch: (search: string) => void;
  author?: string;
  authors: string[];
  onAuthor: (author?: string) => void;
  sort: "asc" | "desc";
  onSort: (sort: "asc" | "desc") => void;
}) {
  return (
    <>
      <Input
        icon="search"
        className={styles.search}
        value={search}
        aria-label="Search commits"
        placeholder="Search commits, keys, or folders..."
        onChange={(event) => {
          onSearch(event.target.value);
        }}
        trailing={
          search ? (
            <Button variant="ghost" size="icon-xs" iconOnly icon="x" onClick={() => onSearch("")}>
              Clear search
            </Button>
          ) : undefined
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button layout="trigger" variant="outline">
            <span className={styles.authorLabel}>{`Author: ${author ?? "Anyone"}`}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAuthor(undefined)}>Anyone</DropdownMenuItem>
          {authors.map((name) => (
            <DropdownMenuItem key={name} onSelect={() => onAuthor(name)}>
              {name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button layout="trigger" variant="outline">
            {sort === "desc" ? "Newest first" : "Oldest first"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onSort("desc")}>
            <Icon icon={ArrowDownWideNarrowIcon} />
            Newest first
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSort("asc")}>
            <Icon icon={ArrowUpWideNarrowIcon} />
            Oldest first
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function HistoryGroups({
  groups,
  remaining,
  filtered,
  onSelect,
  onLoadMore
}: {
  groups: CommitGroup[];
  remaining: number;
  filtered: boolean;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
}) {
  const shown = groups.reduce((total, group) => total + group.commits.length, 0);
  return groups.length ? (
    <div className={styles.groups}>
      {groups.map((group) => (
        <section key={group.date} aria-label={group.date}>
          <div className={styles.groupHead}>
            <Icon name="git" size={16} className={styles.titleIcon} />
            <h3 className={styles.groupDate}>{group.date}</h3>
            <span className={styles.groupCount}>{plural(group.commits.length, "commit")}</span>
          </div>
          <div className={styles.rail}>
            {group.commits.map((item) => (
              <CommitRow key={item.id} commit={item} onSelect={() => onSelect(item.id)} />
            ))}
          </div>
        </section>
      ))}
      {remaining > 0 && (
        <ShowMoreFooter
          status={
            filtered
              ? `Showing ${shown.toLocaleString()} matching commits`
              : `Showing ${shown.toLocaleString()} of ${(shown + remaining).toLocaleString()} commits`
          }
          onShowMore={onLoadMore}
        />
      )}
    </div>
  ) : (
    <EmptyState icon="git" title="No commits found" />
  );
}

function RestoreFolderList({
  folders,
  selectedPath,
  onSelect
}: {
  folders: RestoreFolder[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const folderButton = (item: RestoreFolder) => (
    <button
      key={item.path}
      type="button"
      className={styles.folderButton}
      data-current={item.path === selectedPath || undefined}
      aria-pressed={item.path === selectedPath}
      onClick={() => onSelect(item.path)}
    >
      <span className={styles.folderName}>
        <Icon name="folder" size={16} />
        <span className={styles.truncate}>{item.path}</span>
      </span>
      {item.changes.length > 0 && <Badge tone="soft">{item.changes.length}</Badge>}
    </button>
  );
  return (
    <nav className={styles.folderList} aria-label="Folders to restore">
      {folderButton(folders[0])}
      <div className={styles.folderListLabel}>Child folders to restore</div>
      {folders.slice(1).map(folderButton)}
    </nav>
  );
}

function DetailHeading({
  title,
  latest,
  block,
  onRollBack,
  onRevert
}: {
  title: ReactNode;
  latest: boolean;
  block?: string;
  onRollBack: () => void;
  onRevert: () => void;
}) {
  const menu = { latest, block, onRollBack, onRevert };
  return (
    <div className={styles.detailHead}>
      <SheetTitle className={styles.detailTitle}>{title}</SheetTitle>
      <span className={styles.restoreWide}>
        <RestoreMenu {...menu}>
          <Button layout="trigger" variant="outline" size="xs" disabled={Boolean(block)}>
            Restore options
          </Button>
        </RestoreMenu>
      </span>
      <span className={styles.restoreNarrow}>
        <RestoreMenu {...menu}>
          <Button variant="ghost" size="icon-sm" iconOnly icon="more" disabled={Boolean(block)}>
            Restore options
          </Button>
        </RestoreMenu>
      </span>
    </div>
  );
}

function ExpandAllButton({
  everyFull,
  onToggle
}: {
  everyFull: boolean;
  onToggle: (full: boolean) => void;
}) {
  return (
    <Button variant="ghost" size="xs" onClick={() => onToggle(!everyFull)}>
      <Icon icon={everyFull ? MinimizeIcon : MaximizeIcon} />
      {everyFull ? "Collapse all to summary" : "Expand all to full state"}
    </Button>
  );
}

function RestoreMessage({
  message,
  onMessage,
  block,
  onRestore
}: {
  message: string;
  onMessage: (message: string) => void;
  block?: string;
  onRestore: () => void;
}) {
  return (
    <>
      <Field label="Restore message" wide>
        <Input
          value={message}
          placeholder="Why are you restoring this commit?"
          maxLength={MAX_RESTORE_MESSAGE_LENGTH}
          onChange={(event) => onMessage(event.target.value)}
        />
      </Field>
      <Gate reason={block}>
        <Button disabled={Boolean(block)} onClick={onRestore}>
          Restore
        </Button>
      </Gate>
    </>
  );
}

function RevertDialog({
  open,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" icon="history" confirmText="revert">
        <AlertDialogHeader>
          <AlertDialogTitle>Revert changes</AlertDialogTitle>
          <AlertDialogDescription>
            Restores the previous version of every resource this commit touched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Revert changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreDialog({
  open,
  onOpenChange,
  commitId,
  deep,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitId: string;
  deep: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" icon="history">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Restore commit ${shortId(commitId)}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {deep
              ? "Returns this folder and its child folders to this commit."
              : "Returns this folder to this commit."}{" "}
            Later changes are permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Restore
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RestoreLayout({
  folders,
  selectedPath,
  onSelect,
  children
}: {
  folders: RestoreFolder[];
  selectedPath: string;
  onSelect: (path: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.restoreLayout}>
      {folders.length > 0 && (
        <RestoreFolderList folders={folders} selectedPath={selectedPath} onSelect={onSelect} />
      )}
      <div className={styles.restoreChanges}>{children}</div>
    </div>
  );
}

const NO_ENVIRONMENT = { value: "", label: "" };

const historyList = (
  data: { commits: Commit[]; total: number } | undefined,
  author: string | undefined
) => {
  const loaded = (data?.commits ?? []).map(toViewCommit);
  return {
    authors: [...new Set(loaded.map(authorName))].sort((a, b) => a.localeCompare(b)),
    groups: groupByDate(loaded.filter((commit) => !author || authorName(commit) === author)),
    remaining: Math.max((data?.total ?? 0) - loaded.length, 0)
  };
};

const toDetailCommit = (details: CommitWithChanges["changes"]): ViewCommit => ({
  id: details.id,
  message: details.message,
  actor: details.actorMetadata?.name ?? "Unknown",
  actorType: details.actorType,
  createdAt: details.createdAt,
  summary: undefined
});

const restoreState = ({
  folders,
  path,
  fallbackPath,
  message,
  rollbackBlock
}: {
  folders: RestoreFolder[];
  path: string;
  fallbackPath: string;
  message: string;
  rollbackBlock?: string;
}) => {
  const selected = folders.find((item) => item.path === path) ??
    folders[0] ?? { path: fallbackPath, changes: [] };
  let restoreBlock = rollbackBlock;
  if (!restoreBlock && !folders.some((item) => item.changes.length > 0))
    restoreBlock = "Nothing to restore";
  if (!restoreBlock && !message.trim()) restoreBlock = "Enter a restore message";
  return { selected, changes: sortChanges(selected.changes), restoreBlock };
};

const missingContent = (onBack: () => void) => [
  <SheetHeader key="header">
    <BackLink label="Commit history" onClick={onBack} />
    <SheetTitle className="sr-only">Commit details</SheetTitle>
  </SheetHeader>,
  <SheetBody key="body">
    <EmptyState icon="git" title="Commit not found" />
  </SheetBody>
];

export function CommitHistorySheet({
  onClose,
  scope,
  onToast,
  environment: environmentProp,
  rollbackBlock
}: Pick<OverlayHostProps, "onClose" | "scope" | "onToast"> & {
  environment?: { value: string; label: string };
  rollbackBlock?: string;
}) {
  const adapter = useV4Adapter("secrets");
  const open = Boolean(environmentProp);
  const [wasOpen, setWasOpen] = useState(false);
  const [shown, setShown] = useState(environmentProp);
  const [view, setView] = useState<View>({ name: "history" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [author, setAuthor] = useState<string>();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fullState, setFullState] = useState<Record<string, boolean>>({});
  const [revertOpen, setRevertOpen] = useState(false);
  const [deep, setDeep] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedPath, setSelectedPath] = useState(scope.path);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShown(environmentProp);
      setView({ name: "history" });
      setCollapsed({});
      setFullState({});
    }
  }

  const environment = shown ?? scope.visibleEnvironments[0] ?? NO_ENVIRONMENT;
  const folder = {
    projectId: scope.project,
    environment: environment.value,
    directory: scope.path
  };
  const changeScope = { project: scope.project, environment: environment.value, path: scope.path };
  const envName = environment.label || environmentLabel(environment.value);
  const history = adapter.useCommitHistory({
    ...folder,
    search: search.trim() || undefined,
    sort,
    enabled: open
  });
  const { authors, groups, remaining } = historyList(history.data, author);

  const commitId = view.name === "history" ? "" : view.commitId;
  const details = adapter.useCommitDetails(scope.project, commitId).data?.changes;
  const commit = details && toDetailCommit(details);
  const commitChanges = toDetailChanges(details?.changes ?? [], changeScope);
  const preview = adapter.useRollbackPreview({
    projectId: scope.project,
    folderId: view.name === "restore" ? (details?.folderId ?? "") : "",
    commitId: view.name === "restore" ? commitId : "",
    deepRollback: deep
  }).data;
  const revertCommit = adapter.useCommitRevert({ ...folder, commitId });
  const rollbackCommit = adapter.useCommitRollback({
    ...folder,
    commitId,
    folderId: details?.folderId ?? "",
    deepRollback: deep
  });
  const failed = (title: string) => (error: unknown) =>
    !wasErrorReported(error) &&
    onToast("bad", {
      title,
      description: errorMessage(error)
    });

  const resetCards = () => {
    setCollapsed({});
    setFullState({});
  };
  const toggle = (setter: typeof setCollapsed) => (id: string) =>
    setter((current) => ({ ...current, [id]: !current[id] }));
  const openDetails = (id: string) => {
    resetCards();
    setView({ name: "details", commitId: id });
  };
  const backToHistory = () => {
    resetCards();
    setView({ name: "history" });
  };
  const openRestore = (id: string) => {
    resetCards();
    setDeep(false);
    setMessage("");
    setSelectedPath(scope.path);
    setView({ name: "restore", commitId: id });
  };

  const revert = () => {
    setRevertOpen(false);
    revertCommit.mutateAsync().then(() => {
      onToast("ok", { title: "Changes reverted successfully" });
      backToHistory();
    }, failed("Failed to revert changes"));
  };

  const rollback = () => {
    setConfirmOpen(false);
    rollbackCommit.mutateAsync(message.trim()).then(() => {
      onToast("ok", { title: "Restore completed successfully" });
      backToHistory();
    }, failed("Failed to restore commit"));
  };

  let content: ReactNode = missingContent(backToHistory);
  if (view.name === "history")
    content = [
      <SheetHeader key="header">
        <SheetTitle className={styles.titleRow}>
          <Icon name="git" size={16} className={styles.titleIcon} />
          Commit history
        </SheetTitle>
        <SheetDescription className={styles.meta}>
          <Badge tone="outline">{envName}</Badge>
          <code className={styles.mono}>{scope.path}</code>
          <span>{plural(history.data?.total ?? 0, "commit")}</span>
        </SheetDescription>
      </SheetHeader>,
      <SheetSubheader key="subheader" className={styles.toolbar}>
        <HistoryToolbar
          search={search}
          onSearch={setSearch}
          author={author}
          authors={authors}
          onAuthor={setAuthor}
          sort={sort}
          onSort={setSort}
        />
      </SheetSubheader>,
      <SheetBody key="body">
        <HistoryGroups
          groups={groups}
          remaining={remaining}
          filtered={Boolean(author)}
          onSelect={openDetails}
          onLoadMore={() => history.fetchNextPage()}
        />
      </SheetBody>
    ];

  if (view.name === "details" && commit) {
    const changes = sortChanges(commitChanges);
    const expandable = changes.filter(hasHiddenState);
    content = [
      <SheetHeader key="header" className={styles.detailHeader}>
        <BackLink label="Commit history" onClick={backToHistory} />
        <DetailHeading
          title={commitTitle(commit.message)}
          latest={Boolean(details?.isLatest)}
          block={rollbackBlock}
          onRollBack={() => openRestore(commit.id)}
          onRevert={() => setRevertOpen(true)}
        />
        <CommitMeta
          commit={commit}
          envName={envName}
          path={scope.path}
          onCopied={() => onToast("ok", { title: "Commit ID copied to clipboard" })}
        />
      </SheetHeader>,
      changes.length > 1 && (
        <SheetSubheader key="subheader" className={styles.changedBar}>
          <ChangedCount count={changes.length} summary={summarizeChanges(commitChanges)} />
          {expandable.length > 1 && (
            <ExpandAllButton
              everyFull={expandable.every((change) => fullState[change.id])}
              onToggle={(full) =>
                setFullState(
                  full ? Object.fromEntries(expandable.map((change) => [change.id, true])) : {}
                )
              }
            />
          )}
        </SheetSubheader>
      ),
      <SheetBody key="body">
        {changes.length ? (
          <ChangeCards
            changes={changes}
            collapsed={collapsed}
            fullState={fullState}
            onToggleCollapse={toggle(setCollapsed)}
            onToggleFullState={toggle(setFullState)}
          />
        ) : (
          <EmptyState icon="git" title="No changes found" />
        )}
      </SheetBody>
    ];
  }

  if (view.name === "restore" && commit) {
    const folders = toRestoreFolders(preview ?? [], details?.folderId, changeScope);
    const { selected, changes, restoreBlock } = restoreState({
      folders,
      path: deep ? selectedPath : scope.path,
      fallbackPath: scope.path,
      message,
      rollbackBlock
    });
    content = [
      <SheetHeader key="header">
        <BackLink label="Commit details" onClick={() => openDetails(commit.id)} />
        <SheetTitle className="sr-only">Restore commit</SheetTitle>
        <SheetDescription className={styles.restoreIntro}>
          Returns <code>{scope.path}</code> to commit <code>{shortId(commit.id)}</code>. Every later
          change is undone.
        </SheetDescription>
      </SheetHeader>,
      <SheetSubheader key="subheader" className={styles.deepToggle}>
        <Checkbox
          label="Restore all child folders"
          checked={deep}
          onChange={(checked) => {
            setDeep(checked);
            setSelectedPath(scope.path);
          }}
        />
      </SheetSubheader>,
      <SheetBody key="body">
        <RestoreLayout
          folders={deep && folders.length > 1 ? folders : []}
          selectedPath={selected.path}
          onSelect={setSelectedPath}
        >
          {changes.length ? (
            <ChangeCards
              changes={changes}
              collapsed={collapsed}
              fullState={fullState}
              onToggleCollapse={toggle(setCollapsed)}
              onToggleFullState={toggle(setFullState)}
            />
          ) : (
            <EmptyState
              icon="git"
              title="Nothing to restore"
              description="This folder already matches its state at this commit."
            />
          )}
        </RestoreLayout>
      </SheetBody>,
      <SheetFooter key="footer" className={styles.restoreFooter}>
        <RestoreMessage
          message={message}
          onMessage={setMessage}
          block={restoreBlock}
          onRestore={() => setConfirmOpen(true)}
        />
      </SheetFooter>
    ];
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent className={styles.sheet} onOpenAutoFocus={(event) => event.preventDefault()}>
          {content}
        </SheetContent>
      </Sheet>
      <RevertDialog open={revertOpen} onOpenChange={setRevertOpen} onConfirm={revert} />
      <RestoreDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        commitId={commit?.id ?? ""}
        deep={deep}
        onConfirm={rollback}
      />
    </>
  );
}
