import { Fragment, type ReactNode, useMemo, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { ContextMenuItem, ContextMenuSeparator } from "@infisical/cipher/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { FileTree, type FileTreeNode } from "@infisical/cipher/ui/file-tree";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Meta } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { FilePlusIcon, FolderPlusIcon, SquareTerminalIcon } from "lucide-react";

import {
  getSkillBaseName,
  getSkillEntryNameError,
  getSkillFolders,
  getSkillParentPath,
  joinSkillPath,
  newDraftFile,
  removeSkillPath,
  renameSkillFolders,
  renameSkillPaths,
  SKILL_ENTRY_FILE,
  SKILL_MAX_FILES,
  type TSkillDraftFile
} from "@app/helpers/agentVaultSkills";

import styles from "./skills.module.css";

type TEntryType = "file" | "folder";

type TNewEntry = { type: TEntryType; parentPath: string };

type TTreeNode = FileTreeNode & { children?: TTreeNode[] };

const compareNodes = (a: TTreeNode, b: TTreeNode) => {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  if (a.id === SKILL_ENTRY_FILE) return -1;
  if (b.id === SKILL_ENTRY_FILE) return 1;
  return a.name.localeCompare(b.name);
};

const buildTree = (
  filePaths: string[],
  folderPaths: string[],
  meta: (path: string) => ReactNode
): TTreeNode[] => {
  const root: TTreeNode[] = [];
  const folders = new Map<string, TTreeNode[]>();
  const childrenOf = (path: string): TTreeNode[] => {
    if (!path) return root;
    const existing = folders.get(path);
    if (existing) return existing;
    const children: TTreeNode[] = [];
    folders.set(path, children);
    childrenOf(getSkillParentPath(path)).push({
      id: path,
      name: getSkillBaseName(path),
      type: "folder",
      children
    });
    return children;
  };
  folderPaths.forEach(childrenOf);
  filePaths.forEach((path) =>
    childrenOf(getSkillParentPath(path)).push({
      id: path,
      name: getSkillBaseName(path),
      type: "file",
      meta: meta(path)
    })
  );
  const sort = (nodes: TTreeNode[]): TTreeNode[] =>
    nodes
      .map((node) => (node.children ? { ...node, children: sort(node.children) } : node))
      .sort(compareNodes);
  return sort(root);
};

const SkillNewEntryDialog = ({
  entry,
  filePaths,
  folderPaths,
  onCommit,
  onClose
}: {
  entry: TNewEntry;
  filePaths: string[];
  folderPaths: string[];
  onCommit: (name: string) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState("");
  const noun = entry.type === "file" ? "file" : "folder";
  const completed = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: Boolean(name),
    onDiscard: onClose
  });

  return (
    <div onSubmit={(event) => event.stopPropagation()}>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => !open && !completed.current && requestDiscard()}
        title={`New ${noun}`}
        completeLabel={`Add ${noun}`}
        onComplete={() => {
          completed.current = true;
          onCommit(name);
        }}
        steps={[
          {
            title: "Name",
            validate: () => {
              if (!name) return { fields: { name: "Enter a name." } };
              const message = getSkillEntryNameError({
                name,
                parentPath: entry.parentPath,
                filePaths,
                folderPaths
              });
              return message ? { fields: { name: message } } : true;
            },
            content: (
              <Field
                label={entry.type === "file" ? "File name" : "Folder name"}
                name="name"
                description={entry.parentPath ? `In ${entry.parentPath}/` : undefined}
                wide
              >
                <Input
                  mono
                  value={name}
                  spellCheck={false}
                  placeholder={entry.type === "file" ? "reference.md" : "scripts"}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </div>
  );
};

type TTarget = { path: string; type: TEntryType };

type TEntryAction = {
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

const SkillEntryActions = ({ name, actions }: { name: string; actions: TEntryAction[] }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon-xs"
        icon="more"
        iconOnly
        aria-label={`Options for ${name}`}
        disabled={!actions.length}
        disabledReason={actions.length ? undefined : `${name} can't be renamed or deleted.`}
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {actions.map((action) => (
        <Fragment key={action.label}>
          {action.destructive && <DropdownMenuSeparator />}
          <DropdownMenuItem
            variant={action.destructive ? "destructive" : "default"}
            onSelect={action.onSelect}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        </Fragment>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const SkillEntryContextMenu = ({ name, actions }: { name: string; actions: TEntryAction[] }) =>
  actions.length ? (
    actions.map((action) => (
      <Fragment key={action.label}>
        {action.destructive && <ContextMenuSeparator />}
        <ContextMenuItem
          variant={action.destructive ? "destructive" : "default"}
          onSelect={action.onSelect}
        >
          {action.icon}
          {action.label}
        </ContextMenuItem>
      </Fragment>
    ))
  ) : (
    <ContextMenuItem disabled>{`${name} can't be renamed or deleted.`}</ContextMenuItem>
  );

const SkillFileView = ({
  target,
  file,
  editable,
  hasChildren,
  onTextChange
}: {
  target: TTarget | null;
  file?: TSkillDraftFile;
  editable: boolean;
  hasChildren: boolean;
  onTextChange: (path: string, text: string) => void;
}) => {
  if (!target || !file) return <Meta>No files</Meta>;
  if (target.type === "folder")
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="folder"
        title={hasChildren ? "Pick a file to see it" : "This folder is empty"}
      />
    );
  if (file.text === null)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="file"
        title="Binary file"
        description="It can't be shown or edited here, and is kept as it is."
      />
    );
  return (
    <Textarea
      key={file.path}
      mono
      rows={22}
      aria-label={file.path}
      readOnly={!editable}
      spellCheck={false}
      value={file.text}
      onChange={(event) => onTextChange(file.path, event.target.value)}
    />
  );
};

const resolveTarget = (
  editable: boolean,
  selectedFolder: string | null,
  folderPaths: string[],
  selected?: TSkillDraftFile
): TTarget | null => {
  if (editable && selectedFolder && folderPaths.includes(selectedFolder))
    return { path: selectedFolder, type: "folder" };
  return selected ? { path: selected.path, type: "file" } : null;
};

const newItemParent = (target: TTarget | null) => {
  if (!target) return "";
  return target.type === "folder" ? target.path : getSkillParentPath(target.path);
};

const SkillTreeToolbar = ({
  atFileLimit,
  onCreate
}: {
  atFileLimit: boolean;
  onCreate: (type: TEntryType) => void;
}) => (
  <Inline gap={4} align="center">
    <Button
      variant="ghost"
      size="sm"
      icon={FilePlusIcon}
      disabled={atFileLimit}
      disabledReason={
        atFileLimit ? `A skill can hold at most ${SKILL_MAX_FILES} files.` : undefined
      }
      onClick={() => onCreate("file")}
    >
      New file
    </Button>
    <Button variant="ghost" size="sm" icon={FolderPlusIcon} onClick={() => onCreate("folder")}>
      New folder
    </Button>
  </Inline>
);

const SkillFileHeader = ({ target, isExecutable }: { target: TTarget; isExecutable: boolean }) => {
  const isFile = target.type === "file";
  return (
    <div className={styles.fileHead}>
      <span className={styles.path} title={target.path}>
        {isFile ? target.path : `${target.path}/`}
      </span>
      {isFile && isExecutable && <Badge tone="soft">Executable</Badge>}
    </div>
  );
};

export const SkillFilesEditor = ({
  files,
  selectedPath,
  onSelect,
  editable,
  onChange,
  changedPaths,
  discardablePaths,
  requiredPaths = [SKILL_ENTRY_FILE],
  onDiscardFile
}: {
  files: TSkillDraftFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  editable: boolean;
  onChange?: (files: TSkillDraftFile[]) => void;
  changedPaths?: ReadonlySet<string>;
  discardablePaths?: ReadonlySet<string>;
  requiredPaths?: readonly string[];
  onDiscardFile?: (path: string) => void;
}) => {
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState<TNewEntry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const folderPaths = useMemo(
    () => getSkillFolders(paths, editable ? emptyFolders : []),
    [paths, emptyFolders, editable]
  );
  const selected = files.find((file) => file.path === selectedPath) ?? files[0];
  const modes = useMemo(() => new Map(files.map((file) => [file.path, file.mode])), [files]);

  const tree = useMemo(
    () =>
      buildTree(paths, folderPaths, (path) => {
        const isExecutable = modes.get(path) === "0755";
        const isChanged = changedPaths?.has(path);
        if (!isExecutable && !isChanged) return null;
        return (
          <span className={styles.treeMeta}>
            {isExecutable && <Icon icon={SquareTerminalIcon} label="Executable" />}
            {isChanged && <span role="img" aria-label="Unsaved changes" className={styles.dot} />}
          </span>
        );
      }),
    [paths, folderPaths, modes, changedPaths]
  );

  const collapsedSet = new Set(collapsed);
  const target = resolveTarget(editable, selectedFolder, folderPaths, selected);

  const updateFile = (path: string, patch: Partial<TSkillDraftFile>) =>
    onChange?.(files.map((file) => (file.path === path ? { ...file, ...patch } : file)));

  const deleteEntry = (path: string) => {
    const remaining = removeSkillPath(files, path);
    onChange?.(remaining);
    setEmptyFolders((prev) => removeSkillPath(prev, path));
    setSelectedFolder(null);
    if (selected && !remaining.includes(selected) && remaining[0]) onSelect(remaining[0].path);
  };

  const createEntry = (name: string) => {
    if (!newEntry) return;
    const path = joinSkillPath(newEntry.parentPath, name);
    if (newEntry.type === "file") {
      onChange?.([...files, newDraftFile(path)]);
      setSelectedFolder(null);
      onSelect(path);
    } else {
      setEmptyFolders((prev) => [...prev, path]);
      setSelectedFolder(path);
    }
    setNewEntry(null);
  };

  const renameEntry = (from: string, name: string) => {
    if (requiredPaths.includes(from)) return `${from} can't be renamed.`;
    const message = getSkillEntryNameError({
      name,
      parentPath: getSkillParentPath(from),
      filePaths: paths,
      folderPaths,
      renamingPath: from
    });
    if (message) return message;
    const to = joinSkillPath(getSkillParentPath(from), name);
    onChange?.(renameSkillPaths(files, from, to));
    setEmptyFolders((prev) => renameSkillFolders(prev, from, to));
    setCollapsed((prev) => renameSkillFolders(prev, from, to));
    if (selectedFolder === from) setSelectedFolder(to);
    if (selected && (selected.path === from || selected.path.startsWith(`${from}/`)))
      onSelect(to + selected.path.slice(from.length));
    return undefined;
  };

  const actionsFor = (node: FileTreeNode): TEntryAction[] => {
    const isFile = node.type !== "folder";
    const canChange = !requiredPaths.includes(node.id);
    const isExecutable = modes.get(node.id) === "0755";
    const actions: TEntryAction[] = [];
    if (canChange)
      actions.push({
        label: "Rename",
        icon: <Icon name="pencil" />,
        onSelect: () => setRenaming(node.id)
      });
    if (canChange && isFile)
      actions.push({
        label: isExecutable ? "Make not executable" : "Make executable",
        icon: <Icon icon={SquareTerminalIcon} />,
        onSelect: () => updateFile(node.id, { mode: isExecutable ? "0644" : "0755" })
      });
    if (isFile && onDiscardFile && discardablePaths?.has(node.id))
      actions.push({
        label: "Discard changes",
        icon: <Icon name="undo" />,
        onSelect: () => onDiscardFile(node.id)
      });
    if (canChange)
      actions.push({
        label: isFile ? "Delete file" : "Delete folder",
        icon: <Icon name="trash" />,
        destructive: true,
        onSelect: () => deleteEntry(node.id)
      });
    return actions;
  };

  return (
    <div className={styles.editorFrame}>
      <div className={styles.editor}>
        <div className={styles.treePane}>
          {editable && (
            <SkillTreeToolbar
              atFileLimit={files.length >= SKILL_MAX_FILES}
              onCreate={(type) => setNewEntry({ type, parentPath: newItemParent(target) })}
            />
          )}
          <FileTree
            label="Skill files"
            size="sm"
            truncate="end"
            maxHeight={480}
            items={tree}
            selectable="all"
            selected={target?.path ?? null}
            expanded={folderPaths.filter((path) => !collapsedSet.has(path))}
            onExpandedChange={(ids) => {
              const open = new Set(ids);
              setCollapsed(folderPaths.filter((path) => !open.has(path)));
            }}
            onSelect={(id, node) => {
              if (node.type === "folder") {
                setSelectedFolder(id);
                return;
              }
              setSelectedFolder(null);
              onSelect(id);
            }}
            {...(editable && {
              renaming,
              onRenamingChange: setRenaming,
              onRename: renameEntry,
              renderActions: (node: FileTreeNode) => (
                <SkillEntryActions name={node.name} actions={actionsFor(node)} />
              ),
              renderContextMenu: (node: FileTreeNode) => (
                <SkillEntryContextMenu name={node.name} actions={actionsFor(node)} />
              )
            })}
          />
        </div>
        <div className={styles.filePane}>
          {target && (
            <SkillFileHeader target={target} isExecutable={modes.get(target.path) === "0755"} />
          )}
          <div className={styles.fileBody}>
            <SkillFileView
              target={target}
              file={selected}
              editable={editable}
              hasChildren={paths.some((path) => path.startsWith(`${target?.path}/`))}
              onTextChange={(path, text) => updateFile(path, { text })}
            />
          </div>
        </div>
        {newEntry && (
          <SkillNewEntryDialog
            entry={newEntry}
            filePaths={paths}
            folderPaths={folderPaths}
            onCommit={createEntry}
            onClose={() => setNewEntry(null)}
          />
        )}
      </div>
    </div>
  );
};
