import { faCode } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useRef, useEffect } from "react";
import * as monaco from "monaco-editor";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

type Props = {
  isDisabled?: boolean;
  isFullWidth?: boolean;
  isRequired?: boolean;
};

const codeEditorVariants = cva(
  "relative overflow-hidden w-full p-2 focus:ring-2 ring-primary-800 outline-none border text-gray-400 font-inter placeholder-gray-500 placeholder-opacity-50",
  {
    variants: {
      size: {
        xs: "text-xs",
        sm: "text-sm",
        md: "text-md",
        lg: "text-lg"
      },
      isRounded: {
        true: "rounded-md",
        false: ""
      },
      variant: {
        filled: "bg-mineshaft-900 text-gray-400",
        outline: "bg-transparent",
        plain: "bg-transparent outline-none"
      },
      isError: {
        true: "focus:ring-red/50 placeholder-red-300 border-red",
        false: "focus:ring-primary-400/50 focus:ring-1 border-mineshaft-500"
      }
    },
    compoundVariants: [
      {
        variant: "plain",
        isError: [true, false],
        className: "border-none"
      }
    ]
  }
);

export type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
} & VariantProps<typeof codeEditorVariants> &
  Props;

export const CodeEditor = ({
  value,
  onChange,
  placeholder = "Start typing...",
  className,
  size = "md",
  isRounded = true,
  variant = "filled",
  isError = false,
  isDisabled = false
}: CodeEditorProps) => {
  const [detectedLanguage, setDetectedLanguage] = useState<string>("properties");
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const detectLanguage = (content: string): string => {
    if (!content.trim()) return "properties";
    const trimmed = content.trim();

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(content);
        return "json";
      } catch {
        return "json";
      }
    }

    const yamlPatterns = [
      /^[a-zA-Z_][a-zA-Z0-9_]*:\s*[^\n=]+$/m,
      /^[a-zA-Z_][a-zA-Z0-9_]*:$/m,
      /^\s*-\s+/m,
      /^---\s*$/m,
      /^\s*#/m
    ];
    if (yamlPatterns.some((pattern) => pattern.test(content))) return "yaml";

    if (/^[A-Z_][A-Z0-9_]*=/m.test(content) || content.includes("export ")) return "properties";

    return "properties";
  };

  useEffect(() => {
    if (!containerRef.current) return;

    monaco.editor.defineTheme("secrets-dark-theme", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6B7280", fontStyle: "italic" },
        { token: "variable.name", foreground: "F97316", fontStyle: "bold" },
        { token: "keyword", foreground: "A78BFA", fontStyle: "bold" },
        { token: "delimiter", foreground: "FFFFFF" },
        { token: "string", foreground: "10B981" },
        { token: "string.invalid", foreground: "EF4444" },
        { token: "string.escape", foreground: "6EE7B7" },
        { token: "number", foreground: "60A5FA" }
      ],
      colors: {
        "editor.background": "#19191C",
        "editor.foreground": "#F3F4F6",
        "editor.lineHighlightBackground": "#374151",
        "editor.selectionBackground": "#4338CA",
        "editorCursor.foreground": "#F59E0B",
        "editor.lineHighlightBorder": "#4B5563"
      }
    });

    const editor = monaco.editor.create(containerRef.current, {
      value: value || "",
      language: detectLanguage(value || ""),
      theme: "secrets-dark-theme",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      lineNumbers: "on",
      folding: true,
      autoIndent: "advanced",
      formatOnPaste: true,
      formatOnType: true,
      matchBrackets: "always",
      suggest: { insertMode: "replace" },
      quickSuggestions: { other: true, comments: false, strings: true }
    });

    const disposable = editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      const newLanguage = detectLanguage(newValue);

      if (newLanguage !== detectedLanguage) {
        setDetectedLanguage(newLanguage);
        monaco.editor.setModelLanguage(editor.getModel()!, newLanguage);
      }
      onChange(newValue);
    });

    editorRef.current = editor;

    return () => {
      disposable.dispose();
      editor.dispose();
    };
  }, []);

  const getLanguageColor = (lang: string) => {
    switch (lang) {
      case "json":
        return "text-blue-400";
      case "yaml":
        return "text-green-400";
      case "properties":
        return "text-orange-400";
      default:
        return "text-gray-400";
    }
  };

  const getLanguageDisplay = (lang: string) => {
    switch (lang) {
      case "properties":
        return "ENV";
      case "json":
        return "JSON";
      case "yaml":
        return "YAML";
      default:
        return lang.toUpperCase();
    }
  };

  return (
    <div
      className={twMerge(
        codeEditorVariants({ size, isRounded, variant, isError, className }),
        "focus-within:ring-1 focus-within:ring-primary-800 outline-none border text-gray-400 font-inter placeholder-gray-500 placeholder-opacity-50",
        isDisabled && "pointer-events-none"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-mineshaft-600 bg-mineshaft-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            icon={faCode}
            className={`h-4 w-4 ${getLanguageColor(detectedLanguage)}`}
          />
          <span className={`text-sm font-medium ${getLanguageColor(detectedLanguage)}`}>
            {getLanguageDisplay(detectedLanguage)}
          </span>
        </div>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="h-[50vh] min-h-[400px] w-full" />

      {/* Placeholder */}
      {!value && (
        <div className="pointer-events-none absolute inset-0 top-12 flex items-center justify-center text-mineshaft-400">
          <span>{placeholder}</span>
        </div>
      )}
    </div>
  );
};
