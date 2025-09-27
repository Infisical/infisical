import { faCode } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState, useRef, useEffect, useCallback } from "react";
import * as monaco from "monaco-editor";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

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
  isDisabled?: boolean;
} & VariantProps<typeof codeEditorVariants>;

// Optimized language detection
const detectLanguage = (content: string): string => {
  const trimmed = content.trim();
  if (!trimmed) return "env";

  // JSON detection
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || 
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "json";
    }
  }

  // Simple scoring for YAML vs ENV
  let yamlScore = 0;
  let envScore = 0;

  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;

    // ENV indicators
    if (l.includes("=")) {
      const eqIndex = l.indexOf("=");
      if (eqIndex > 0 && !l.includes(":")) envScore++;
    }
    if (l.startsWith("export ")) envScore++;

    // YAML indicators  
    if (l.includes(":") && !l.includes("=")) yamlScore++;
    if (l.startsWith("- ")) yamlScore++;
    if (l === "---") yamlScore++;
  }

  return yamlScore > envScore ? "yaml" : "env";
};

// Singleton pattern for theme and language registration
let isInitialized = false;

const initializeMonaco = () => {
  if (isInitialized) return;
  
  // Register ENV language
  monaco.languages.register({ id: "env" });
  
  // Define theme
  monaco.editor.defineTheme("secrets-dark-theme", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B7280", fontStyle: "italic" },
      { token: "key", foreground: "F97316", fontStyle: "bold" },
      { token: "delimiter", foreground: "FFFFFF" },
      { token: "string", foreground: "10B981" },
      { token: "number", foreground: "60A5FA" }
    ],
    colors: {
      "editor.background": "#19191C",
      "editor.foreground": "#F3F4F6",
      "editor.lineHighlightBackground": "#374151",
      "editor.selectionBackground": "#4338CA",
      "editorCursor.foreground": "#F59E0B"
    }
  });

  isInitialized = true;
};

const LANGUAGE_CONFIG = {
  json: { color: "text-blue-400", display: "JSON" },
  yaml: { color: "text-green-400", display: "YAML" },
  env: { color: "text-orange-400", display: "ENV" }
} as const;

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
  const [detectedLanguage, setDetectedLanguage] = useState<string>("env");
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLanguageChange = useCallback((newValue: string) => {
    const newLanguage = detectLanguage(newValue);
    if (newLanguage !== detectedLanguage) {
      setDetectedLanguage(newLanguage);
      if (editorRef.current) {
        monaco.editor.setModelLanguage(editorRef.current.getModel()!, newLanguage);
      }
    }
    onChange(newValue);
  }, [detectedLanguage, onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    initializeMonaco();

    const detectedLang = detectLanguage(value || "");
    setDetectedLanguage(detectedLang);

    const editor = monaco.editor.create(containerRef.current, {
      value: value || "",
      language: detectedLang,
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
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoClosingOvertype: "always",
      autoSurround: "quotes",
      bracketPairColorization: { enabled: true },
      suggest: {
        insertMode: "replace",
        showKeywords: true,
        showSnippets: true,
        showFunctions: true,
        showVariables: true,
        showProperties: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showClasses: true,
        showModules: true,
        showInterfaces: true,
        showStructs: true,
        showTypeParameters: true,
        showOperators: true,
        showUnits: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showWords: true
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      },
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: "on",
      tabCompletion: "on",
      wordBasedSuggestions: "allDocuments",
      suggestOnTriggerCharacters: true,
      detectIndentation: true,
      tabSize: 2
    });

    const disposable = editor.onDidChangeModelContent(() => {
      handleLanguageChange(editor.getValue());
    });

    editorRef.current = editor;

    return () => {
      disposable.dispose();
      editor.dispose();
    };
  }, []);

  // Update editor value when prop changes
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.getValue()) {
      const newLanguage = detectLanguage(value);
      if (newLanguage !== detectedLanguage) {
        setDetectedLanguage(newLanguage);
        monaco.editor.setModelLanguage(editorRef.current.getModel()!, newLanguage);
      }
      editorRef.current.setValue(value);
    }
  }, [value, detectedLanguage]);

  const langConfig = LANGUAGE_CONFIG[detectedLanguage as keyof typeof LANGUAGE_CONFIG] || 
                    { color: "text-gray-400", display: detectedLanguage.toUpperCase() };

  return (
    <div
      className={twMerge(
        codeEditorVariants({ size, isRounded, variant, isError, className }),
        "border font-inter text-gray-400 placeholder-gray-500 outline-none focus-within:ring-1 focus-within:ring-primary-800",
        isDisabled && "pointer-events-none"
      )}
    >
      <div className="flex items-center justify-between border-b border-mineshaft-600 bg-mineshaft-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faCode} className={`h-4 w-4 ${langConfig.color}`} />
          <span className={`text-sm font-medium ${langConfig.color}`}>
            {langConfig.display}
          </span>
        </div>
        <span className="text-xs text-mineshaft-400">Ctrl+Space for suggestions</span>
      </div>

      <div ref={containerRef} className="h-[50vh] min-h-[400px] w-full" />

      {!value && (
        <div className="pointer-events-none absolute inset-0 top-12 flex items-center justify-center text-mineshaft-400">
          <span>{placeholder}</span>
        </div>
      )}
    </div>
  );
};