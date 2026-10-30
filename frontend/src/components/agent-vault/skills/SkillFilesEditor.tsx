import { useEffect, useMemo, useRef, useState } from "react";
import {
  CodeIcon,
  EyeIcon,
  FilePlusIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SquareTerminalIcon,
  TrashIcon,
  Undo2Icon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FileTree,
  type FileTreeInlineEdit,
  type FileTreeItemType,
  IconButton,
  Input,
  Markdown,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { CodeEditor } from "@app/components/v3/generic/CodeEditor";
import {
  getSkillBaseName,
  getSkillEntryNameError,
  getSkillFolders,
  getSkillParentPath,
  isMarkdownPath,
  joinSkillPath,
  newDraftFile,
  removeSkillPath,
  renameSkillFolders,
  renameSkillPaths,
  SKILL_MAX_FILES,
  splitFrontmatter,
  TSkillDraftFile
} from "@app/helpers/agentVaultSkills";

type TTreeTarget = { path: string; type: FileTreeItemType } | null;

/**
 * For the sheet around the editor: Escape in a file or folder name box cancels only that box, and Escape in the code
 * editor moves the focus out to the sheet, so Tab, which indents inside the editor, can leave it. The sheet listens
 * for Escape on the document before either sees it, so they can't stop it from closing the sheet themselves.
 */
export const handleSkillEditorEscape = (event: KeyboardEvent) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-skill-name-input]")) {
    event.preventDefault();
    return;
  }
  if (event.target.closest('.cm-content[contenteditable="true"]')) {
    event.preventDefault();
    event.target.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
  }
};

type TContextMenu = { x: number; y: number; target: TTreeTarget };

type InlineNameInputProps = {
  initialValue: string;
  isFile: boolean;
  getError: (name: string) => string | null;
  onCommit: (name: string) => void;
  onCancel: () => void;
};

const InlineNameInput = ({
  initialValue,
  isFile,
  getError,
  onCommit,
  onCancel
}: InlineNameInputProps) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = value && value !== initialValue ? getError(value) : null;

  // Focused after the menu that opened it has finished closing, which would otherwise take the focus back.
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus());
    return () => clearTimeout(timer);
  }, []);

  const commit = () => {
    if (!value || value === initialValue) {
      onCancel();
      return;
    }
    if (getError(value)) return;
    onCommit(value);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => {
          const dot = event.target.value.lastIndexOf(".");
          event.target.setSelectionRange(0, isFile && dot > 0 ? dot : event.target.value.length);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        onBlur={() => {
          if (value && value !== initialValue && !getError(value)) onCommit(value);
          else onCancel();
        }}
        data-skill-name-input
        aria-label={isFile ? "File name" : "Folder name"}
        aria-invalid={Boolean(error)}
        spellCheck={false}
        autoComplete="off"
        size="sm"
        className="font-mono"
        isError={Boolean(error)}
      />
      {error && <p className="text-2xs leading-snug text-danger">{error}</p>}
    </div>
  );
};

type Props = {
  files: TSkillDraftFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  isEditing: boolean;
  onChange?: (files: TSkillDraftFile[]) => void;
  /** Paths marked as changed in the tree. */
  changedPaths?: ReadonlySet<string>;
  /** Changed files whose saved copy has the same path, so "Discard Changes" can put it back. */
  discardablePaths?: ReadonlySet<string>;
  /** Files that can't be renamed or deleted. */
  requiredPaths?: readonly string[];
  /** Which view Markdown files open in. Code is where an editable file is changed. */
  defaultView?: "preview" | "code";
  /** Changing it gives every file a fresh undo history, so undo can't bring back text that was discarded or replaced. */
  historyKey?: string | number;
  /** Like historyKey for one file, so discarding a file's changes resets only that file's undo history. */
  fileHistoryKeys?: Readonly<Record<string, number>>;
  /** Puts back the saved copy of a changed file, offered in that file's menu. */
  onDiscardFile?: (path: string) => void;
  className?: string;
};

export const SkillFilesEditor = ({
  files,
  selectedPath,
  onSelect,
  isEditing,
  onChange,
  changedPaths,
  discardablePaths,
  requiredPaths = [],
  defaultView = "preview",
  historyKey = 0,
  fileHistoryKeys,
  onDiscardFile,
  className
}: Props) => {
  const [view, setView] = useState<"preview" | "code">(defaultView);
  const [emptyFolders, setEmptyFolders] = useState<string[]>([]);
  const [inlineEdit, setInlineEdit] = useState<FileTreeInlineEdit | null>(null);
  const [contextMenu, setContextMenu] = useState<TContextMenu | null>(null);

  useEffect(() => {
    setEmptyFolders([]);
    setInlineEdit(null);
  }, [isEditing]);

  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const folderPaths = useMemo(() => getSkillFolders(paths, emptyFolders), [paths, emptyFolders]);
  const selected = files.find((file) => file.path === selectedPath) ?? files[0];
  const isMarkdown = selected ? isMarkdownPath(selected.path) : false;
  const canPreview = isMarkdown && selected?.text !== null;
  const showRendered = canPreview && view === "preview";
  const isAtFileLimit = files.length >= SKILL_MAX_FILES;
  const modes = useMemo(() => new Map(files.map((file) => [file.path, file.mode])), [files]);
  const hasExecutable = files.some((file) => file.mode === "0755");
  const hasChangedPaths = Boolean(changedPaths?.size);
  const newItemParent = selected ? getSkillParentPath(selected.path) : "";

  const rendered = useMemo(
    () =>
      showRendered && typeof selected?.text === "string" ? splitFrontmatter(selected.text) : null,
    [showRendered, selected?.text]
  );

  const updateFile = (path: string, patch: Partial<TSkillDraftFile>) =>
    onChange?.(files.map((file) => (file.path === path ? { ...file, ...patch } : file)));

  const startCreate = (type: FileTreeItemType, parentPath: string) =>
    setInlineEdit({ action: "create", type, parentPath });

  const deleteEntry = (path: string) => {
    const remaining = removeSkillPath(files, path);
    onChange?.(remaining);
    setEmptyFolders((prev) => removeSkillPath(prev, path));
    if (selected && !remaining.includes(selected) && remaining[0]) onSelect(remaining[0].path);
  };

  const commitInlineEdit = (name: string) => {
    if (!inlineEdit) return;
    if (inlineEdit.action === "create") {
      const path = joinSkillPath(inlineEdit.parentPath, name);
      if (inlineEdit.type === "file") {
        onChange?.([...files, newDraftFile(path)]);
        onSelect(path);
      } else {
        setEmptyFolders((prev) => [...prev, path]);
      }
    } else {
      const from = inlineEdit.path;
      const to = joinSkillPath(getSkillParentPath(from), name);
      onChange?.(renameSkillPaths(files, from, to));
      setEmptyFolders((prev) => renameSkillFolders(prev, from, to));
      if (selected && (selected.path === from || selected.path.startsWith(`${from}/`))) {
        onSelect(to + selected.path.slice(from.length));
      }
    }
    setInlineEdit(null);
  };

  const getInlineError = (name: string) => {
    if (!inlineEdit) return null;
    if (inlineEdit.action === "create") {
      return getSkillEntryNameError({
        name,
        parentPath: inlineEdit.parentPath,
        filePaths: paths,
        folderPaths
      });
    }
    return getSkillEntryNameError({
      name,
      parentPath: getSkillParentPath(inlineEdit.path),
      filePaths: paths,
      folderPaths,
      renamingPath: inlineEdit.path
    });
  };

  const canDiscardFile = (target: TTreeTarget) =>
    Boolean(onDiscardFile && target?.type === "file" && discardablePaths?.has(target.path));

  // New items go in the empty space or inside a folder; a file only changes, discards or deletes itself.
  const hasMenuItems = (target: TTreeTarget) =>
    !target ||
    target.type === "folder" ||
    !requiredPaths.includes(target.path) ||
    canDiscardFile(target);

  const renderMenuItems = (target: TTreeTarget) => {
    const canCreate = !target || target.type === "folder";
    const canChange = target && !requiredPaths.includes(target.path);
    const parentPath = target?.path ?? "";
    const isExecutable = target ? modes.get(target.path) === "0755" : false;
    return (
      <>
        {canCreate && (
          <>
            <DropdownMenuItem
              isDisabled={isAtFileLimit}
              onClick={() => startCreate("file", parentPath)}
            >
              <FilePlusIcon />
              New File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startCreate("folder", parentPath)}>
              <FolderPlusIcon />
              New Folder
            </DropdownMenuItem>
          </>
        )}
        {canCreate && canChange && <DropdownMenuSeparator />}
        {canChange && (
          <>
            <DropdownMenuItem
              onClick={() =>
                setInlineEdit({ action: "rename", type: target.type, path: target.path })
              }
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            {target.type === "file" && (
              <DropdownMenuItem
                onClick={() => updateFile(target.path, { mode: isExecutable ? "0644" : "0755" })}
              >
                <SquareTerminalIcon />
                {isExecutable ? "Make Not Executable" : "Make Executable"}
              </DropdownMenuItem>
            )}
          </>
        )}
        {target && canDiscardFile(target) && (
          <DropdownMenuItem onClick={() => onDiscardFile?.(target.path)}>
            <Undo2Icon />
            Discard Changes
          </DropdownMenuItem>
        )}
        {canChange && (
          <DropdownMenuItem variant="danger" onClick={() => deleteEntry(target.path)}>
            <TrashIcon />
            {target.type === "folder" ? "Delete Folder" : "Delete File"}
          </DropdownMenuItem>
        )}
      </>
    );
  };

  const openContextMenu = (event: React.MouseEvent, target: TTreeTarget) => {
    event.preventDefault();
    if (!hasMenuItems(target)) return;
    setContextMenu({ x: event.clientX, y: event.clientY, target });
  };

  // Not modal: a modal menu keeps the focus while it closes, which blurs and cancels the name input it just opened.
  const renderActions = (path: string, type: FileTreeItemType) => {
    if (!isEditing) return null;
    // A required file still gets the button, disabled, so its unsaved dot lines up with every other row's.
    if (!hasMenuItems({ path, type })) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <IconButton
                variant="ghost"
                size="2xs"
                isDisabled
                aria-label={`No actions for ${path}`}
              >
                <MoreHorizontalIcon />
              </IconButton>
            </span>
          </TooltipTrigger>
          <TooltipContent>{path} can&apos;t be renamed or deleted.</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" size="2xs" aria-label={`Open actions for ${path}`}>
            <MoreHorizontalIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={2}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {renderMenuItems({ path, type })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div
      className={twMerge(
        "grid h-[32rem] min-h-0 min-w-0 grid-rows-[minmax(0,10rem)_minmax(0,1fr)] overflow-hidden rounded-md border border-border md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:grid-rows-1",
        className
      )}
    >
      <FileTree
        paths={paths}
        folders={emptyFolders}
        selectedPath={selected?.path ?? null}
        onSelect={onSelect}
        renderIndicator={(path) =>
          hasExecutable || hasChangedPaths ? (
            <span className="flex shrink-0 items-center gap-1">
              {hasExecutable && (
                <span className="flex w-3.5 justify-center">
                  {modes.get(path) === "0755" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span role="img" aria-label="Executable" className="flex">
                          <SquareTerminalIcon className="size-3.5 text-muted" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Executable</TooltipContent>
                    </Tooltip>
                  )}
                </span>
              )}
              {hasChangedPaths && (
                <span className="mr-1 flex w-1.5 justify-center">
                  {changedPaths?.has(path) && (
                    <span
                      aria-label="Unsaved changes"
                      className="size-1.5 rounded-full bg-warning"
                    />
                  )}
                </span>
              )}
            </span>
          ) : null
        }
        renderActions={isEditing ? renderActions : undefined}
        onItemContextMenu={
          isEditing ? (event, path, type) => openContextMenu(event, { path, type }) : undefined
        }
        onBackgroundContextMenu={isEditing ? (event) => openContextMenu(event, null) : undefined}
        inlineEdit={inlineEdit}
        renderInlineEdit={() =>
          inlineEdit && (
            <InlineNameInput
              key={inlineEdit.action === "rename" ? inlineEdit.path : inlineEdit.parentPath}
              initialValue={inlineEdit.action === "rename" ? getSkillBaseName(inlineEdit.path) : ""}
              isFile={inlineEdit.type === "file"}
              getError={getInlineError}
              onCommit={commitInlineEdit}
              onCancel={() => setInlineEdit(null)}
            />
          )
        }
        footer={
          isEditing ? (
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  className="flex-1 justify-start"
                  isDisabled={isAtFileLimit}
                  onClick={() => startCreate("file", newItemParent)}
                >
                  <FilePlusIcon />
                  New File
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="flex-1 justify-start"
                  onClick={() => startCreate("folder", newItemParent)}
                >
                  <FolderPlusIcon />
                  New Folder
                </Button>
              </div>
              {isAtFileLimit && (
                <p className="px-2 text-2xs text-muted">
                  A skill can hold at most {SKILL_MAX_FILES} files.
                </p>
              )}
            </div>
          ) : undefined
        }
        className="border-b border-border p-2 md:border-r md:border-b-0"
      />

      {contextMenu && (
        <DropdownMenu modal={false} open onOpenChange={(open) => !open && setContextMenu(null)}>
          <DropdownMenuTrigger
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          />
          <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
            {renderMenuItems(contextMenu.target)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <div className="flex min-h-0 min-w-0 flex-col">
        {selected && (
          <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-label" title={selected.path}>
              {selected.path}
            </span>
            {selected.mode === "0755" && <Badge variant="neutral">Executable</Badge>}
            {canPreview && (
              <ButtonGroup aria-label="How to show the file">
                <Button
                  size="xs"
                  variant={view === "preview" ? "av" : "outline"}
                  aria-pressed={view === "preview"}
                  onClick={() => setView("preview")}
                >
                  <EyeIcon />
                  Preview
                </Button>
                <Button
                  size="xs"
                  variant={view === "code" ? "av" : "outline"}
                  aria-pressed={view === "code"}
                  onClick={() => setView("code")}
                >
                  <CodeIcon />
                  Code
                </Button>
              </ButtonGroup>
            )}
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1">
          {selected && selected.text === null && (
            <Empty className="m-3 border">
              <EmptyHeader>
                <EmptyTitle>Binary file</EmptyTitle>
                <EmptyDescription>
                  It can&apos;t be shown or edited here. It is kept as it is.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {rendered && (
            <div className="h-full thin-scrollbar overflow-y-auto p-4">
              {rendered.frontmatter && (
                <pre className="mb-4 thin-scrollbar overflow-x-auto rounded-md border border-border bg-container p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-label">
                  {rendered.frontmatter}
                </pre>
              )}
              <Markdown>{rendered.body}</Markdown>
            </div>
          )}
          {/* Stays mounted while hidden, so each file keeps its undo history for as long as the editor is open. */}
          {selected && (
            <CodeEditor
              value={selected.text ?? ""}
              onChange={(text) => updateFile(selected.path, { text })}
              language={isMarkdown ? "markdown" : "plain"}
              isReadOnly={!isEditing}
              hasLineWrapping={isMarkdown}
              stateKey={`${isEditing ? "edit" : "view"}:${historyKey}:${fileHistoryKeys?.[selected.path] ?? 0}:${selected.path}`}
              aria-label={selected.path}
              isBorderless
              className={twMerge("h-full", (selected.text === null || showRendered) && "hidden")}
            />
          )}
        </div>
      </div>
    </div>
  );
};
