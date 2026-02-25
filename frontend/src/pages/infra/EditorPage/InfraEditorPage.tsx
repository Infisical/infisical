import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useCallback, useEffect, useRef, useState } from "react";

// Load Monaco from the local bundle to avoid CSP violations.
self.MonacoEnvironment = {
  getWorker: () => new editorWorker()
};
loader.config({ monaco });

import {
  ChevronRightIcon,
  FileIcon,
  FilePlusIcon,
  FolderOpenIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import {
  Button,
  Skeleton,
  UnstableIconButton
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useApproveInfraRun, useDeleteInfraFile, useInfraFiles, useTriggerInfraRun, useUpsertInfraFile } from "@app/hooks/api/infra";
import { TAiInsight, TPlanJson } from "@app/hooks/api/infra/types";

import { InfraRunOverlay } from "./InfraRunOverlay";

type LocalFile = {
  name: string;
  content: string;
  dirty: boolean;
};

const DEFAULT_MAIN_TF = `# Infisical Infra — write your OpenTofu config here

resource "local_file" "hello" {
  content  = "Hello from Infisical Infra!"
  filename = "/tmp/infisical-infra-hello.txt"
}
`;

export const InfraEditorPage = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;

  // API hooks
  const { data: remoteFiles, isLoading: filesLoading } = useInfraFiles(projectId);
  const upsertFile = useUpsertInfraFile();
  const deleteFile = useDeleteInfraFile();
  const triggerRun = useTriggerInfraRun();
  const approveRun = useApproveInfraRun();

  // Local state
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState("");
  const [aiInsight, setAiInsight] = useState<TAiInsight | null>(null);
  const [planJson, setPlanJson] = useState<TPlanJson | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"plan" | "apply">("plan");
  const [initialized, setInitialized] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState<{ runId: string } | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFile = files[activeFileIndex];

  // Load remote files into local state
  useEffect(() => {
    if (filesLoading || initialized) return;
    if (remoteFiles && remoteFiles.length > 0) {
      setFiles(remoteFiles.map((f) => ({ name: f.name, content: f.content, dirty: false })));
    } else {
      setFiles([{ name: "main.tf", content: DEFAULT_MAIN_TF, dirty: true }]);
    }
    setInitialized(true);
  }, [remoteFiles, filesLoading, initialized]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  // Auto-save with debounce
  const scheduleSave = useCallback(
    (fileName: string, content: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        upsertFile.mutate({ projectId, name: fileName, content });
        setFiles((prev) => prev.map((f) => (f.name === fileName ? { ...f, dirty: false } : f)));
      }, 1000);
    },
    [projectId, upsertFile]
  );

  const handleFileContentChange = (value: string | undefined) => {
    if (value === undefined || !activeFile) return;
    setFiles((prev) => prev.map((f, i) => (i === activeFileIndex ? { ...f, content: value, dirty: true } : f)));
    scheduleSave(activeFile.name, value);
  };

  const handleAddFile = () => {
    const baseName = "new";
    const ext = ".tf";
    let name = `${baseName}${ext}`;
    let counter = 1;
    while (files.some((f) => f.name === name)) {
      name = `${baseName}${counter}${ext}`;
      counter += 1;
    }
    const content = `# ${name}\n`;
    const newFiles = [...files, { name, content, dirty: true }];
    setFiles(newFiles);
    setActiveFileIndex(newFiles.length - 1);
    upsertFile.mutate({ projectId, name, content });
  };

  const handleDeleteFile = (index: number) => {
    if (files.length <= 1) return;
    const file = files[index];
    deleteFile.mutate({ projectId, name: file.name });
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    if (activeFileIndex >= newFiles.length) {
      setActiveFileIndex(newFiles.length - 1);
    } else if (activeFileIndex === index) {
      setActiveFileIndex(Math.max(0, index - 1));
    }
  };

  const handleRenameFile = (index: number) => {
    const current = files[index];
    // eslint-disable-next-line no-alert
    const newName = window.prompt("Rename file:", current.name);
    if (!newName || newName === current.name) return;
    if (files.some((f, i) => i !== index && f.name === newName)) {
      // eslint-disable-next-line no-alert
      window.alert("A file with that name already exists.");
      return;
    }
    deleteFile.mutate({ projectId, name: current.name });
    upsertFile.mutate({ projectId, name: newName, content: current.content });
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, name: newName } : f)));
  };

  // Save all dirty files before running
  const saveAllFiles = async () => {
    const dirtyFiles = files.filter((f) => f.dirty);
    await Promise.all(dirtyFiles.map((f) => upsertFile.mutateAsync({ projectId, name: f.name, content: f.content })));
    setFiles((prev) => prev.map((f) => ({ ...f, dirty: false })));
  };

  const handleRun = async (runMode: "plan" | "apply") => {
    setMode(runMode);
    setIsRunning(true);
    setOutput("");
    setAiInsight(null);
    setPlanJson(null);
    setAwaitingApproval(null);
    setOverlayOpen(true);

    await saveAllFiles();

    try {
      const result = await triggerRun.mutateAsync({ projectId, mode: runMode });
      setOutput(result.output);
      if (result.planJson) setPlanJson(result.planJson as TPlanJson);
      if (result.aiSummary) {
        try {
          setAiInsight(JSON.parse(result.aiSummary) as TAiInsight);
        } catch {
          setAiInsight({ summary: result.aiSummary, costs: { estimated: [], aiEstimated: [], totalMonthly: "N/A", deltaMonthly: "N/A" }, security: { issues: [], shouldApprove: false } });
        }
      }
      if (result.status === "awaiting_approval") {
        setAwaitingApproval({ runId: result.runId });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setOutput(`Error: ${message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleApprove = async () => {
    if (!awaitingApproval) return;
    const { runId } = awaitingApproval;
    setAwaitingApproval(null);
    await approveRun.mutateAsync({ projectId, runId });
    handleRun("apply");
  };

  if (filesLoading && !initialized) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-mineshaft-600 bg-mineshaft-800/50 px-4 py-2">
          <div className="flex items-center gap-3">
            <FolderOpenIcon className="size-4 text-mineshaft-400" />
            <span className="text-sm font-medium text-mineshaft-200">workspace</span>
            <ChevronRightIcon className="size-3 text-mineshaft-600" />
            <span className="text-sm text-mineshaft-300">{activeFile?.name}</span>
            {activeFile?.dirty && <span className="size-2 rounded-full bg-yellow-500" title="Unsaved changes" />}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRun("plan")}
              isDisabled={isRunning}
              isPending={isRunning && mode === "plan"}
            >
              Plan
            </Button>
            <Button
              variant="success"
              size="sm"
              onClick={() => handleRun("apply")}
              isDisabled={isRunning}
              isPending={isRunning && mode === "apply"}
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Main area: sidebar + editor */}
        <div className="flex min-h-0 flex-1">
          {/* File sidebar */}
          <div className="flex w-52 shrink-0 flex-col border-r border-mineshaft-600 bg-mineshaft-900">
            <div className="flex items-center justify-between border-b border-mineshaft-600 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-mineshaft-400">Explorer</span>
              <UnstableIconButton variant="ghost" size="xs" onClick={handleAddFile}>
                <FilePlusIcon className="size-3.5" />
              </UnstableIconButton>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {files.map((file, i) => (
                <div
                  key={file.name}
                  role="button"
                  tabIndex={0}
                  className={`group flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                    i === activeFileIndex
                      ? "bg-mineshaft-700/60 text-mineshaft-100"
                      : "text-mineshaft-400 hover:bg-mineshaft-800 hover:text-mineshaft-200"
                  }`}
                  onClick={() => {
                    setActiveFileIndex(i);
                    editorRef.current?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setActiveFileIndex(i);
                      editorRef.current?.focus();
                    }
                  }}
                >
                  <FileIcon className="size-3.5 shrink-0 text-mineshaft-500" />
                  <span className="flex-1 truncate">{file.name}</span>
                  {file.dirty && <span className="size-1.5 shrink-0 rounded-full bg-yellow-500" />}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-0.5 text-mineshaft-500 hover:text-mineshaft-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameFile(i);
                      }}
                    >
                      <PencilIcon className="size-3" />
                    </button>
                    {files.length > 1 && (
                      <button
                        type="button"
                        className="rounded p-0.5 text-mineshaft-500 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(i);
                        }}
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Editor area — full height now */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Open file tabs */}
            <div className="flex shrink-0 items-center border-b border-mineshaft-600 bg-mineshaft-900">
              {files.map((file, i) => (
                <button
                  key={file.name}
                  type="button"
                  className={`flex items-center gap-1.5 border-r border-mineshaft-600 px-3 py-1.5 text-xs transition-colors ${
                    i === activeFileIndex
                      ? "bg-[#1e1e1e] text-mineshaft-100"
                      : "bg-mineshaft-800 text-mineshaft-500 hover:text-mineshaft-300"
                  }`}
                  onClick={() => {
                    setActiveFileIndex(i);
                    editorRef.current?.focus();
                  }}
                >
                  <FileIcon className="size-3" />
                  {file.name}
                  {file.dirty && <span className="size-1.5 rounded-full bg-yellow-500" />}
                </button>
              ))}
            </div>

            {/* Monaco Editor */}
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                language="hcl"
                theme="vs-dark"
                value={activeFile?.content ?? ""}
                onChange={handleFileContentChange}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 8 },
                  renderLineHighlight: "gutter",
                  automaticLayout: true,
                  tabSize: 2,
                  readOnly: false
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Run overlay */}
      <InfraRunOverlay
        isOpen={overlayOpen}
        onClose={() => setOverlayOpen(false)}
        mode={mode}
        isRunning={isRunning}
        output={output}
        planJson={planJson}
        aiInsight={aiInsight}
        awaitingApproval={awaitingApproval !== null}
        onApprove={handleApprove}
        onDeny={() => setAwaitingApproval(null)}
      />
    </>
  );
};
