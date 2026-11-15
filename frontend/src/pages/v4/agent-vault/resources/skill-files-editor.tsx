import { type ReactNode, useMemo, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
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

type TNameEdit =
  | { action: "create"; type: TEntryType; parentPath: string }
  | { action: "rename"; type: TEntryType; path: string };

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

const getNameEditError = (
  edit: TNameEdit,
  name: string,
  filePaths: string[],
  folderPaths: string[]
) =>
  getSkillEntryNameError({
    name,
    parentPath: edit.action === "create" ? edit.parentPath : getSkillParentPath(edit.path),
    filePaths,
    folderPaths,
    ...(edit.action === "rename" && { renamingPath: edit.path })
  });

const SkillEntryNameDialog = ({
  edit,
  filePaths,
  folderPaths,
  onCommit,
  onClose
}: {
  edit: TNameEdit;
  filePaths: string[];
  folderPaths: string[];
  onCommit: (name: string) => void;
  onClose: () => void;
}) => {
  const initialName = edit.action === "rename" ? getSkillBaseName(edit.path) : "";
  const [name, setName] = useState(initialName);
  const noun = edit.type === "file" ? "file" : "folder";
  const completed = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: name !== initialName,
    onDiscard: onClose
  });

  return (
    <div onSubmit={(event) => event.stopPropagation()}>
      <MultiStep
        variant="dialog"
        open
        onOpenChange={(open) => !open && !completed.current && requestDiscard()}
        title={edit.action === "rename" ? `Rename ${initialName}` : `New ${noun}`}
        completeLabel={edit.action === "rename" ? "Rename" : `Add ${noun}`}
        onComplete={() => {
          completed.current = true;
          if (name === initialName) onClose();
          else onCommit(name);
        }}
        steps={[
          {
            title: "Name",
            validate: () => {
              if (!name) return { fields: { name: "Enter a name." } };
              const message =
                name === initialName ? null : getNameEditError(edit, name, filePaths, folderPaths);
              return message ? { fields: { name: message } } : true;
            },
            content: (
              <Field
                label={edit.type === "file" ? "File name" : "Folder name"}
                name="name"
                description={
                  edit.action === "create" && edit.parentPath ? `In ${edit.parentPath}/` : undefined
                }
                wide
              >
                <Input
                  mono
                  value={name}
                  spellCheck={false}
                  placeholder={edit.type === "file" ? "reference.md" : "scripts"}
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

const SkillEntryMenu = ({
  target,
  canChange,
  canDiscard,
  isExecutable,
  onRename,
  onToggleExecutable,
  onDiscard,
  onDelete
}: {
  target: TTarget;
  canChange: boolean;
  canDiscard: boolean;
  isExecutable: boolean;
  onRename: () => void;
  onToggleExecutable: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon-sm"
        icon="more"
        iconOnly
        aria-label={`Options for ${target.path}`}
        disabled={!canChange && !canDiscard}
        disabledReason={
          !canChange && !canDiscard ? `${target.path} can't be renamed or deleted.` : undefined
        }
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {canChange && (
        <DropdownMenuItem onSelect={onRename}>
          <Icon name="pencil" />
          Rename
        </DropdownMenuItem>
      )}
      {canChange && target.type === "file" && (
        <DropdownMenuItem onSelect={onToggleExecutable}>
          <Icon icon={SquareTerminalIcon} />
          {isExecutable ? "Make not executable" : "Make executable"}
        </DropdownMenuItem>
      )}
      {canDiscard && (
        <DropdownMenuItem onSelect={onDiscard}>
          <Icon name="undo" />
          Discard changes
        </DropdownMenuItem>
      )}
      {canChange && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Icon name="trash" />
            {target.type === "folder" ? "Delete folder" : "Delete file"}
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
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

const SkillFileHeader = ({
  target,
  editable,
  canChange,
  canDiscard,
  isExecutable,
  onRename,
  onSetMode,
  onDiscard,
  onDelete
}: {
  target: TTarget;
  editable: boolean;
  canChange: boolean;
  canDiscard: boolean;
  isExecutable: boolean;
  onRename: () => void;
  onSetMode: (mode: TSkillDraftFile["mode"]) => void;
  onDiscard: () => void;
  onDelete: () => void;
}) => {
  const isFile = target.type === "file";
  return (
    <div className={styles.fileHead}>
      <span className={styles.path} title={target.path}>
        {isFile ? target.path : `${target.path}/`}
      </span>
      {isFile && isExecutable && <Badge tone="soft">Executable</Badge>}
      {editable && (
        <SkillEntryMenu
          target={target}
          canChange={canChange}
          canDiscard={isFile && canDiscard}
          isExecutable={isExecutable}
          onRename={onRename}
          onToggleExecutable={() => onSetMode(isExecutable ? "0644" : "0755")}
          onDiscard={onDiscard}
          onDelete={onDelete}
        />
      )}
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
  const [nameEdit, setNameEdit] = useState<TNameEdit | null>(null);

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

  const commitName = (name: string) => {
    if (!nameEdit) return;
    if (nameEdit.action === "create") {
      const path = joinSkillPath(nameEdit.parentPath, name);
      if (nameEdit.type === "file") {
        onChange?.([...files, newDraftFile(path)]);
        setSelectedFolder(null);
        onSelect(path);
      } else {
        setEmptyFolders((prev) => [...prev, path]);
        setSelectedFolder(path);
      }
    } else {
      const from = nameEdit.path;
      const to = joinSkillPath(getSkillParentPath(from), name);
      onChange?.(renameSkillPaths(files, from, to));
      setEmptyFolders((prev) => renameSkillFolders(prev, from, to));
      setCollapsed((prev) => renameSkillFolders(prev, from, to));
      if (selectedFolder === from) setSelectedFolder(to);
      if (selected && (selected.path === from || selected.path.startsWith(`${from}/`)))
        onSelect(to + selected.path.slice(from.length));
    }
    setNameEdit(null);
  };

  return (
    <div className={styles.editorFrame}>
      <div className={styles.editor}>
        <div className={styles.treePane}>
          {editable && (
            <SkillTreeToolbar
              atFileLimit={files.length >= SKILL_MAX_FILES}
              onCreate={(type) =>
                setNameEdit({ action: "create", type, parentPath: newItemParent(target) })
              }
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
          />
        </div>
        <div className={styles.filePane}>
          {target && (
            <SkillFileHeader
              target={target}
              editable={editable}
              canChange={!requiredPaths.includes(target.path)}
              canDiscard={Boolean(onDiscardFile && discardablePaths?.has(target.path))}
              isExecutable={modes.get(target.path) === "0755"}
              onRename={() =>
                setNameEdit({ action: "rename", type: target.type, path: target.path })
              }
              onSetMode={(mode) => updateFile(target.path, { mode })}
              onDiscard={() => onDiscardFile?.(target.path)}
              onDelete={() => deleteEntry(target.path)}
            />
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
        {nameEdit && (
          <SkillEntryNameDialog
            edit={nameEdit}
            filePaths={paths}
            folderPaths={folderPaths}
            onCommit={commitName}
            onClose={() => setNameEdit(null)}
          />
        )}
      </div>
    </div>
  );
};
