import { type ReactNode, useState } from "react";
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

import { environmentLabel, Gate, LOCAL_ONLY } from "../flows/shared";
import { ActionButton } from "../overview-cells";
import type { OverlayHostProps } from "../row-actions/types";
import {
  type CommitSummary,
  inScope,
  isFirstCommit,
  isLatestCommit,
  LOCAL_ACTOR,
  type LocalCommit,
  newCommitId,
  revertState,
  rollbackState,
  summarizeChanges
} from "./commits-model";
import { ResourceChangeCard, sortChanges } from "./resource-change-card";

import styles from "./commits.module.css";

const COMMITS_PER_PAGE = 10;
const MAX_RESTORE_MESSAGE_LENGTH = 256;
const PLATFORM_HINT = "Generated automatically by the platform as part of an automated event.";

type View =
  | { name: "history" }
  | { name: "details"; commitId: string }
  | { name: "restore"; commitId: string };

const authorName = (commit: LocalCommit) =>
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

function Author({ commit }: { commit: LocalCommit }) {
  return (
    <span className={styles.inlineGroup}>
      <span className={styles.truncate}>{authorName(commit)}</span>
      {commit.actorType === "platform" && (
        <Tooltip wrap content={PLATFORM_HINT}>
          <span className={styles.hint}>
            <Icon name="info" size={12} label="About platform commits" />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

function CommitRow({ commit, onSelect }: { commit: LocalCommit; onSelect: () => void }) {
  const summary = summarizeChanges(commit.changes);
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
  resources,
  onApply,
  onToast,
  environment: environmentProp,
  commits: allCommits,
  onRecordCommit,
  rollbackBlock
}: OverlayHostProps & {
  environment?: { value: string; label: string };
  commits: readonly LocalCommit[];
  onRecordCommit: (commit: LocalCommit) => void;
  rollbackBlock?: string;
}) {
  const open = Boolean(environmentProp);
  const [wasOpen, setWasOpen] = useState(false);
  const [shown, setShown] = useState(environmentProp);
  const [view, setView] = useState<View>({ name: "history" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [author, setAuthor] = useState<string>();
  const [pages, setPages] = useState(1);
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
  const folder = { project: scope.project, environment: environment.value, path: scope.path };
  const envName = environment.label || environmentLabel(environment.value);
  const scoped = allCommits.filter((commit) => inScope(commit, folder));
  const authors = [...new Set(scoped.map(authorName))].sort((a, b) => a.localeCompare(b));
  const query = search.trim().toLowerCase();
  const filtered = scoped
    .filter((commit) => !author || authorName(commit) === author)
    .filter(
      (commit) =>
        !query ||
        [commit.message, commit.id, commit.actor, ...commit.changes.map((change) => change.name)]
          .join("\n")
          .toLowerCase()
          .includes(query)
    )
    .sort((a, b) =>
      sort === "desc"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt)
    );
  const visible = filtered.slice(0, pages * COMMITS_PER_PAGE);
  const groups = visible.reduce<{ date: string; commits: LocalCommit[] }[]>((acc, commit) => {
    const date = format(new Date(commit.createdAt), "MMM d, yyyy");
    const group = acc.at(-1);
    if (group?.date === date) group.commits.push(commit);
    else acc.push({ date, commits: [commit] });
    return acc;
  }, []);
  const remaining = filtered.length - visible.length;

  const commit =
    view.name === "history" ? undefined : scoped.find((item) => item.id === view.commitId);
  const resetCards = () => {
    setCollapsed({});
    setFullState({});
  };
  const toggle = (setter: typeof setCollapsed) => (id: string) =>
    setter((current) => ({ ...current, [id]: !current[id] }));
  const openDetails = (commitId: string) => {
    resetCards();
    setView({ name: "details", commitId });
  };
  const backToHistory = () => {
    resetCards();
    setView({ name: "history" });
  };
  const openRestore = (commitId: string) => {
    resetCards();
    setDeep(false);
    setMessage("");
    setSelectedPath(scope.path);
    setView({ name: "restore", commitId });
  };

  const record = (changes: LocalCommit["changes"], commitMessage: string, path = scope.path) =>
    onRecordCommit({
      id: newCommitId(),
      ...folder,
      path,
      message: commitMessage,
      actor: LOCAL_ACTOR,
      actorType: "user",
      createdAt: new Date().toISOString(),
      changes
    });

  const revert = (target: LocalCommit) => {
    setRevertOpen(false);
    if (isFirstCommit(allCommits, target)) {
      onToast("bad", {
        title: "Cannot revert the first commit",
        description: "Nothing was changed in the local demo data."
      });
      return;
    }
    const { changes } = revertState(resources, target);
    if (!changes.length) {
      onToast("neutral", { title: "No changes to revert", description: LOCAL_ONLY });
      return;
    }
    onApply((current) => revertState(current, target).resources, {
      title: "Changes reverted successfully",
      description: LOCAL_ONLY
    });
    record(changes, `Reverted changes from commit ${target.id}`);
    backToHistory();
  };

  const rollback = (target: LocalCommit) => {
    setConfirmOpen(false);
    const preview = rollbackState(allCommits, target, resources, deep);
    onApply((current) => rollbackState(allCommits, target, current, deep).resources, {
      title: "Restore completed successfully",
      description: LOCAL_ONLY
    });
    preview.folders
      .filter((item) => item.changes.length)
      .forEach((item) =>
        record(item.changes, message.trim() || "Rolled back folder state", item.path)
      );
    backToHistory();
  };

  const missing = [
    <SheetHeader key="header">
      <BackLink label="Commit history" onClick={backToHistory} />
      <SheetTitle className="sr-only">Commit details</SheetTitle>
      <SheetDescription className="sr-only">This commit could not be found</SheetDescription>
    </SheetHeader>,
    <SheetBody key="body">
      <EmptyState
        icon="git"
        title="Commit not found"
        description="This commit is no longer part of this folder's history."
      />
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
          <span>{plural(scoped.length, "commit")}</span>
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
            setPages(1);
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
                <Button variant="outline" onClick={() => setPages(pages + 1)}>
                  {`Load ${remaining} ${sort === "desc" ? "older" : "newer"} commits`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon="git"
            title="No commits found"
            description={
              query || author
                ? "No commits match your search and filters."
                : "Changes to secrets and folders in this path will show up here."
            }
          />
        )}
      </SheetBody>
    ];

  if (view.name === "details" && commit) {
    const changes = sortChanges(commit.changes);
    const summary = summarizeChanges(commit.changes);
    const everyFull = changes.length > 0 && changes.every((change) => fullState[change.id]);
    const latest = isLatestCommit(allCommits, commit);
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
                    : "Return this folder to its exact state at this commit, discarding every change made after it."
                }
                onSelect={() => openRestore(commit.id)}
              >
                Roll back to this commit
              </DropdownMenuItem>
              <DropdownMenuItem
                description="Restore the previous version of the resources this commit touched."
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
    const preview = rollbackState(allCommits, commit, resources, deep);
    const nested = preview.folders.slice(1);
    const selected =
      preview.folders.find((item) => item.path === (deep ? selectedPath : scope.path)) ??
      preview.folders[0];
    const changes = sortChanges(selected.changes);
    const hasAnyChanges = preview.folders.some((item) => item.changes.length > 0);
    const folderButton = (item: (typeof preview.folders)[number]) => (
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
          Restoring returns <code>{scope.path}</code> to how it looked at commit{" "}
          <code>{shortId(commit.id)}</code>. Every change made after this commit is undone.
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
        <Tooltip content="Also returns every nested folder to its state at this commit.">
          <span className={styles.hint}>
            <Icon name="info" size={14} label="About restoring child folders" />
          </span>
        </Tooltip>
      </SheetSubheader>,
      <SheetBody key="body">
        <div className={styles.restoreLayout}>
          {deep && nested.length > 0 && (
            <nav className={styles.folderList} aria-label="Folders to restore">
              {folderButton(preview.folders[0])}
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
              This undoes every change made in this commit by restoring the previous version of the
              resources it touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (commit) revert(commit);
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
                ? "This returns this folder and every child folder to its state at this commit."
                : "This returns this folder to its state at this commit."}{" "}
              Changes made after this commit are permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (commit) rollback(commit);
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
