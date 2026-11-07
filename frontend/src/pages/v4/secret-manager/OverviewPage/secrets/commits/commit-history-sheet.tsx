import { type ReactNode, useState } from "react";
import type { AxiosError } from "axios";
import { format } from "date-fns";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpWideNarrowIcon,
  MaximizeIcon,
  MinimizeIcon
} from "lucide-react";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type { Commit } from "@app/hooks/api/folderCommits/types";

import { useV4Adapter } from "../../../../data/adapters";
import { environmentLabel, Gate } from "../flows/shared";
import { ActionButton } from "../overview-cells";
import type { OverlayHostProps } from "../row-actions/types";
import { toCommitChange } from "./commit-changes";
import { type CommitResourceChange, type CommitSummary, summarizeChanges } from "./commits-model";
import { ResourceChangeCard, sortChanges } from "./resource-change-card";

import styles from "./commits.module.css";

const MAX_RESTORE_MESSAGE_LENGTH = 256;
const PLATFORM_HINT = "Made automatically by Infisical, not by a user.";

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
const plural = (count: number, singular: string) =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;

const resourceSummary = (summary: CommitSummary) =>
  [
    summary.secretCount ? plural(summary.secretCount, "secret") : "",
    summary.folderCount ? plural(summary.folderCount, "folder") : ""
  ]
    .filter(Boolean)
    .join(", ");

function ChangeSummary({ summary, showLabels }: { summary: CommitSummary; showLabels?: boolean }) {
  const kinds = [
    { count: summary.addedCount, symbol: "+", label: "added" },
    { count: summary.updatedCount, symbol: "~", label: "updated" },
    { count: summary.deletedCount, symbol: "-", label: "deleted" }
  ].filter((kind) => kind.count > 0);
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
        <span className={styles.commitMessage}>
          {commit.message || <span className={styles.noMessage}>No message</span>}
        </span>
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

  const environment = shown ?? scope.visibleEnvironments[0] ?? { value: "", label: "" };
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
  const loaded = (history.data?.commits ?? []).map(toViewCommit);
  const authors = [...new Set(loaded.map(authorName))].sort((a, b) => a.localeCompare(b));
  const visible = loaded.filter((commit) => !author || authorName(commit) === author);
  const groups = visible.reduce<{ date: string; commits: ViewCommit[] }[]>((acc, commit) => {
    const date = format(new Date(commit.createdAt), "MMM d, yyyy");
    const group = acc.at(-1);
    if (group?.date === date) group.commits.push(commit);
    else acc.push({ date, commits: [commit] });
    return acc;
  }, []);
  const remaining = Math.max((history.data?.total ?? 0) - loaded.length, 0);

  const commitId = view.name === "history" ? "" : view.commitId;
  const details = adapter.useCommitDetails(scope.project, commitId).data?.changes;
  const commit: ViewCommit | undefined = details && {
    id: details.id,
    message: details.message,
    actor: details.actorMetadata?.name ?? "Unknown",
    actorType: details.actorType,
    createdAt: details.createdAt,
    summary: undefined
  };
  const commitChanges = (details?.changes ?? [])
    .map((change) =>
      toCommitChange(changeScope, {
        id: change.id,
        type: change.folderVersionId || change.folderName ? "folder" : "secret",
        action:
          change.changeType === "add"
            ? "create"
            : (change.changeType as "create" | "update" | "delete"),
        name: change.secretKey ?? change.folderName ?? "Unnamed",
        versions: change.versions as unknown as { version: number }[]
      })
    )
    .filter((change): change is CommitResourceChange => change !== null);
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
    onToast("bad", {
      title,
      description:
        (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
        (error instanceof Error ? error.message : undefined)
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

  const missing = [
    <SheetHeader key="header">
      <BackLink label="Commit history" onClick={backToHistory} />
      <SheetTitle className="sr-only">Commit details</SheetTitle>
    </SheetHeader>,
    <SheetBody key="body">
      <EmptyState icon="git" title="Commit not found" />
    </SheetBody>
  ];

  let content: ReactNode = missing;
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
        <Input
          icon="search"
          className={styles.search}
          value={search}
          aria-label="Search commits"
          placeholder="Search commits, keys, or folders..."
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          trailing={
            search ? (
              <Button
                variant="ghost"
                size="icon-xs"
                iconOnly
                icon="x"
                onClick={() => setSearch("")}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <span className={styles.authorLabel}>{`Author: ${author ?? "Anyone"}`}</span>
              <Icon name="chev-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setAuthor(undefined)}>Anyone</DropdownMenuItem>
            {authors.map((name) => (
              <DropdownMenuItem key={name} onSelect={() => setAuthor(name)}>
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              {sort === "desc" ? "Newest first" : "Oldest first"}
              <Icon name="chev-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setSort("desc")}>
              <Icon icon={ArrowDownWideNarrowIcon} />
              Newest first
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSort("asc")}>
              <Icon icon={ArrowUpWideNarrowIcon} />
              Oldest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SheetSubheader>,
      <SheetBody key="body">
        {groups.length ? (
          <div className={styles.groups}>
            {groups.map((group) => (
              <section key={group.date} aria-label={group.date}>
                <div className={styles.groupHead}>
                  <Icon name="git" size={16} className={styles.titleIcon} />
                  <h3 className={styles.groupDate}>{group.date}</h3>
                  <span className={styles.groupCount}>
                    {plural(group.commits.length, "commit")}
                  </span>
                </div>
                <div className={styles.rail}>
                  {group.commits.map((item) => (
                    <CommitRow key={item.id} commit={item} onSelect={() => openDetails(item.id)} />
                  ))}
                </div>
              </section>
            ))}
            {remaining > 0 && (
              <div className={styles.loadMore}>
                <Button variant="outline" onClick={() => history.fetchNextPage()}>
                  {`Load ${remaining} ${sort === "desc" ? "older" : "newer"} commits`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="git" title="No commits found" />
        )}
      </SheetBody>
    ];

  if (view.name === "details" && commit) {
    const changes = sortChanges(commitChanges);
    const summary = summarizeChanges(commitChanges);
    const everyFull = changes.length > 0 && changes.every((change) => fullState[change.id]);
    const latest = Boolean(details?.isLatest);
    content = [
      <SheetHeader key="header">
        <BackLink label="Commit history" onClick={backToHistory} />
        <div className={styles.detailHead}>
          <div className={styles.detailTitle}>
            <SheetTitle>
              {commit.message || <span className={styles.noMessage}>No message</span>}
            </SheetTitle>
            <SheetDescription className={styles.meta}>
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
                    await navigator.clipboard.writeText(commit.id);
                    onToast("ok", { title: "Commit ID copied to clipboard" });
                  }}
                />
              </span>
              <Badge tone="outline">{envName}</Badge>
              <code className={styles.mono}>{scope.path}</code>
            </SheetDescription>
          </div>
          <DropdownMenu>
            <Gate reason={rollbackBlock}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={Boolean(rollbackBlock)}>
                  Restore options
                  <Icon name="chev-down" />
                </Button>
              </DropdownMenuTrigger>
            </Gate>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={latest}
                description={
                  latest
                    ? "This is already the latest commit for this folder."
                    : "Discards every change made after this commit."
                }
                onSelect={() => openRestore(commit.id)}
              >
                Roll back to this commit
              </DropdownMenuItem>
              <DropdownMenuItem
                description="Undoes only the changes in this commit."
                onSelect={() => setRevertOpen(true)}
              >
                Revert changes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetHeader>,
      changes.length > 0 && (
        <SheetSubheader key="subheader" className={styles.changedBar}>
          <span className={styles.changedCount}>
            <span>{`${plural(changes.length, "resource")} changed`}</span>
            <ChangeSummary summary={summary} showLabels />
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              setFullState(
                everyFull ? {} : Object.fromEntries(changes.map((change) => [change.id, true]))
              )
            }
          >
            <Icon icon={everyFull ? MinimizeIcon : MaximizeIcon} />
            {everyFull ? "Collapse all to summary" : "Expand all to full state"}
          </Button>
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
    const folders = [...(preview ?? [])]
      .sort(
        (x, y) =>
          Number(y.folderId === details?.folderId) - Number(x.folderId === details?.folderId)
      )
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
              { ...changeScope, path: item.folderPath },
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
    const nested = folders.slice(1);
    const selected = folders.find((item) => item.path === (deep ? selectedPath : scope.path)) ??
      folders[0] ?? { path: scope.path, changes: [] };
    const changes = sortChanges(selected.changes);
    const hasAnyChanges = folders.some((item) => item.changes.length > 0);
    const folderButton = (item: (typeof folders)[number]) => (
      <button
        key={item.path}
        type="button"
        className={styles.folderButton}
        data-current={item.path === selected.path || undefined}
        aria-pressed={item.path === selected.path}
        onClick={() => setSelectedPath(item.path)}
      >
        <span className={styles.folderName}>
          <Icon name="folder" size={16} />
          <span className={styles.truncate}>{item.path}</span>
        </span>
        {item.changes.length > 0 && <Badge tone="soft">{item.changes.length}</Badge>}
      </button>
    );
    let restoreBlock = rollbackBlock;
    if (!restoreBlock && !hasAnyChanges) restoreBlock = "Nothing to restore";
    if (!restoreBlock && !message.trim()) restoreBlock = "Enter a restore message";
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
        <div className={styles.restoreLayout}>
          {deep && nested.length > 0 && (
            <nav className={styles.folderList} aria-label="Folders to restore">
              {folderButton(folders[0])}
              <div className={styles.folderListLabel}>Child folders to restore</div>
              {nested.map(folderButton)}
            </nav>
          )}
          <div className={styles.restoreChanges}>
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
          </div>
        </div>
      </SheetBody>,
      <SheetFooter key="footer" className={styles.restoreFooter}>
        <Field label="Restore message" wide>
          <Input
            value={message}
            placeholder="Why are you restoring this commit?"
            maxLength={MAX_RESTORE_MESSAGE_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Gate reason={restoreBlock}>
          <Button disabled={Boolean(restoreBlock)} onClick={() => setConfirmOpen(true)}>
            Restore
          </Button>
        </Gate>
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
      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent tone="danger" icon="history" confirmText="revert">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert changes</AlertDialogTitle>
            <AlertDialogDescription>
              Restores the previous version of every resource this commit touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                revert();
              }}
            >
              Revert changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent tone="danger" icon="history">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Restore commit ${shortId(commit?.id ?? "")}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deep
                ? "Returns this folder and its child folders to this commit."
                : "Returns this folder to this commit."}{" "}
              Later changes are permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                rollback();
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
