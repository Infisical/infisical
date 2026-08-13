import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  FileIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  XIcon
} from "lucide-react";

import { IconButton } from "@app/components/v3";
import { TSandboxDirEntry, useListSandboxFiles, useReadSandboxFile } from "@app/hooks/api/sandboxes";

/**
 * The container's filesystem, beside the terminal it belongs to. Deliberately built from the same
 * palette and monospace as the shell rather than the surrounding product chrome, so the two panels
 * read as one console split in half.
 */

const SANDBOX_HOME = "/home/agent";

const formatSize = (bytes: number | null) => {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** `/home/agent/.slack` reads as `~/.slack`, the same shorthand the terminal prompt uses. */
const displayPath = (path: string) =>
  path === SANDBOX_HOME ? "~" : `~${path.slice(SANDBOX_HOME.length)}`;

const Row = ({
  entry,
  isSelected,
  onOpen
}: {
  entry: TSandboxDirEntry;
  isSelected: boolean;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs transition-colors ${
      isSelected ? "bg-white/10 text-[#c8ccd0]" : "text-[#c8ccd0]/80 hover:bg-white/5"
    }`}
  >
    {entry.isDirectory ? (
      <FolderIcon className="size-3.5 shrink-0 text-[#00a2c7]" />
    ) : (
      <FileIcon className="size-3.5 shrink-0 text-white/30" />
    )}
    <span className="truncate">{entry.name}</span>
    <span className="ml-auto shrink-0 tabular-nums text-white/25">{formatSize(entry.size)}</span>
  </button>
);

export const SandboxFileBrowser = ({
  sandboxId,
  isRunning
}: {
  sandboxId: string;
  isRunning: boolean;
}) => {
  const [path, setPath] = useState(SANDBOX_HOME);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { data, isFetching, refetch } = useListSandboxFiles(sandboxId, path, isRunning);
  const { data: file, isPending: isFilePending } = useReadSandboxFile(sandboxId, openFile);

  const isAtHome = path === SANDBOX_HOME;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.entries ?? [];
    return (data?.entries ?? []).filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [data, query]);

  const openEntry = (entry: TSandboxDirEntry) => {
    if (entry.isDirectory) {
      setOpenFile(null);
      setQuery("");
      setPath(entry.path);
      return;
    }
    setOpenFile(entry.path);
  };

  return (
    <div className="flex h-[calc(100vh-24rem)] min-h-[320px] flex-col overflow-hidden rounded-md border border-border bg-[#111417]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-2 py-1.5">
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Go up a directory"
          isDisabled={isAtHome}
          onClick={() => {
            setOpenFile(null);
            setQuery("");
            setPath(path.slice(0, path.lastIndexOf("/")) || SANDBOX_HOME);
          }}
        >
          <ChevronLeftIcon className="size-3.5 text-white/50" />
        </IconButton>

        <span className="truncate font-mono text-xs text-white/50">{displayPath(path)}</span>

        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Refresh"
          className="ml-auto"
          onClick={() => void refetch()}
        >
          <RefreshCwIcon className={`size-3.5 text-white/40 ${isFetching ? "animate-spin" : ""}`} />
        </IconButton>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1.5">
          <SearchIcon className="size-3.5 shrink-0 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter this folder..."
            className="w-full bg-transparent font-mono text-xs text-[#c8ccd0] placeholder:text-white/25 focus:outline-none"
          />
          {query && (
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Clear filter"
              onClick={() => setQuery("")}
            >
              <XIcon className="size-3 text-white/40" />
            </IconButton>
          )}
        </div>
      )}

      {!isRunning ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <p className="text-xs text-white/40">Start the sandbox to browse its files.</p>
        </div>
      ) : (
        <div className="thin-scrollbar flex-1 overflow-y-auto p-1.5">
          {visible.length === 0 && (
            <p className="px-2 py-1 font-mono text-xs text-white/30">
              {query ? `nothing matching "${query}"` : "empty"}
            </p>
          )}
          {visible.map((entry) => (
            <Row
              key={entry.path}
              entry={entry}
              isSelected={entry.path === openFile}
              onOpen={() => openEntry(entry)}
            />
          ))}
        </div>
      )}

      {/* The preview takes the lower half rather than a dialog, so the tree stays navigable. */}
      {openFile && (
        <div className="flex h-1/2 flex-col border-t border-white/10">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="truncate font-mono text-[11px] text-white/50">
              {displayPath(openFile)}
            </span>
            {file?.wasTruncated && (
              <span className="shrink-0 text-[10px] text-yellow-500/70">truncated</span>
            )}
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Close preview"
              className="ml-auto"
              onClick={() => setOpenFile(null)}
            >
              <XIcon className="size-3.5 text-white/40" />
            </IconButton>
          </div>

          <div className="thin-scrollbar flex-1 overflow-auto px-2 pb-2">
            {isFilePending ? (
              <Loader2Icon className="mt-2 size-4 animate-spin text-white/30" />
            ) : (
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre text-[#c8ccd0]">
                {file?.content || "(empty file)"}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
