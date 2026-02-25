import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useCallback, useRef, useState } from "react";

// Load Monaco from the local bundle to avoid CSP violations.
// Set up web workers via Vite's ?worker import.
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
  SparklesIcon,
  TerminalIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";

type InfraFile = {
  name: string;
  content: string;
};

const DEFAULT_FILES: InfraFile[] = [
  {
    name: "main.tf",
    content: `# Infisical Infra — write your OpenTofu config here

resource "local_file" "hello" {
  content  = "Hello from Infisical Infra!"
  filename = "/tmp/infisical-infra-hello.txt"
}
`
  },
  {
    name: "variables.tf",
    content: `variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "region" {
  description = "Cloud region"
  type        = string
  default     = "us-east-1"
}
`
  },
  {
    name: "outputs.tf",
    content: `output "file_path" {
  description = "Path to the generated file"
  value       = local_file.hello.filename
}
`
  }
];

const AI_SUGGESTION = {
  title: "Add a provider block",
  description:
    "Your configuration doesn't have a provider block. Consider adding a provider with backend configuration for remote state management.",
  snippet: `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "my-terraform-state"
    key    = "state/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.region
}
`
};

export const InfraEditorPage = () => {
  const [files, setFiles] = useState<InfraFile[]>(DEFAULT_FILES);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"plan" | "apply">("plan");
  const [showAiSuggestion, setShowAiSuggestion] = useState(true);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const outputRef = useRef<HTMLPreElement>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const resizingRef = useRef(false);

  const activeFile = files[activeFileIndex];

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  const handleFileContentChange = (value: string | undefined) => {
    if (value === undefined) return;
    setFiles((prev) =>
      prev.map((f, i) => (i === activeFileIndex ? { ...f, content: value } : f))
    );
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
    const newFiles = [...files, { name, content: `# ${name}\n` }];
    setFiles(newFiles);
    setActiveFileIndex(newFiles.length - 1);
  };

  const handleDeleteFile = (index: number) => {
    if (files.length <= 1) return;
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
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, name: newName } : f))
    );
  };

  const handleApplySuggestion = () => {
    const newFiles = [...files, { name: "providers.tf", content: AI_SUGGESTION.snippet }];
    setFiles(newFiles);
    setActiveFileIndex(newFiles.length - 1);
    setShowAiSuggestion(false);
  };

  const handleRun = async (runMode: "plan" | "apply") => {
    setMode(runMode);
    setIsRunning(true);
    setOutput("");

    const hcl = files.map((f) => `# --- ${f.name} ---\n${f.content}`).join("\n\n");

    try {
      const { data } = await apiRequest.post<{ output: string; status: string }>(
        "/api/v1/infra/run",
        { hcl, mode: runMode }
      );
      setOutput(data.output);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setOutput(`Error: ${message}`);
    } finally {
      setIsRunning(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      const startY = e.clientY;
      const startH = consoleHeight;

      const onMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = startY - ev.clientY;
        setConsoleHeight(Math.max(80, Math.min(500, startH + delta)));
      };

      const onUp = () => {
        resizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [consoleHeight]
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 160px)" }}>
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-mineshaft-600 bg-mineshaft-800/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <FolderOpenIcon className="size-4 text-mineshaft-400" />
          <span className="text-sm font-medium text-mineshaft-200">workspace</span>
          <ChevronRightIcon className="size-3 text-mineshaft-600" />
          <span className="text-sm text-mineshaft-300">{activeFile?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {showAiSuggestion && !files.some((f) => f.name === "providers.tf") && (
            <Button variant="ghost" size="xs" onClick={handleApplySuggestion}>
              <SparklesIcon className="size-3" />
              AI: Add provider block
            </Button>
          )}
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
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-mineshaft-600 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mineshaft-400">
              Explorer
            </span>
            <UnstableIconButton variant="ghost" size="xs" onClick={handleAddFile}>
              <FilePlusIcon className="size-3.5" />
            </UnstableIconButton>
          </div>

          {/* File list */}
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

          {/* AI suggestion in sidebar */}
          {showAiSuggestion && !files.some((f) => f.name === "providers.tf") && (
            <div className="border-t border-mineshaft-600 p-3">
              <UnstableCard className="border-primary/20 bg-primary/[0.03]">
                <UnstableCardHeader className="p-2 pb-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <SparklesIcon className="size-3 text-primary" />
                      <UnstableCardTitle className="text-[11px] font-medium text-mineshaft-200">
                        AI Suggestion
                      </UnstableCardTitle>
                    </div>
                    <button
                      type="button"
                      className="text-mineshaft-600 hover:text-mineshaft-300"
                      onClick={() => setShowAiSuggestion(false)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                </UnstableCardHeader>
                <UnstableCardContent className="p-2 pt-0">
                  <p className="text-[11px] leading-relaxed text-mineshaft-500">
                    {AI_SUGGESTION.description}
                  </p>
                  <Button
                    variant="outline"
                    size="xs"
                    className="mt-1.5 w-full"
                    onClick={handleApplySuggestion}
                  >
                    <SparklesIcon className="size-3" />
                    Apply
                  </Button>
                </UnstableCardContent>
              </UnstableCard>
            </div>
          )}
        </div>

        {/* Editor + Console vertical split */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Open file tabs */}
          <div className="flex shrink-0 items-center bg-mineshaft-900 border-b border-mineshaft-600">
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

          {/* Resize handle */}
          <div
            role="separator"
            className="h-1 shrink-0 cursor-row-resize bg-mineshaft-700 transition-colors hover:bg-primary/40"
            onMouseDown={handleResizeStart}
          />

          {/* Console panel */}
          <div className="flex shrink-0 flex-col" style={{ height: consoleHeight }}>
            <div className="flex items-center justify-between border-b border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <TerminalIcon className="size-3.5 text-mineshaft-400" />
                <span className="text-xs font-medium text-mineshaft-300">Terminal</span>
                {isRunning && (
                  <Badge variant="warning" className="animate-pulse">
                    Running...
                  </Badge>
                )}
              </div>
              {output && (
                <Button variant="ghost" size="xs" onClick={() => setOutput("")}>
                  <Trash2Icon className="size-3" />
                  Clear
                </Button>
              )}
            </div>
            <pre
              ref={outputRef}
              className="min-h-0 flex-1 overflow-auto bg-[#1e1e1e] p-3 font-mono text-xs text-green-400"
            >
              {output || (
                <span className="text-mineshaft-600">
                  Click &quot;Plan&quot; or &quot;Apply&quot; to run your configuration...
                </span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
