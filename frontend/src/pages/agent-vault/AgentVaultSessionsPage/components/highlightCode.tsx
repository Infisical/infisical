import { ReactNode } from "react";
import { typescriptLanguage } from "@codemirror/lang-javascript";
import { pythonLanguage } from "@codemirror/lang-python";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { Language, StreamLanguage } from "@codemirror/language";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { highlightCode, tagHighlighter, tags } from "@lezer/highlight";

// The same colors as the v3 CodeEditor's highlight style.
const highlighter = tagHighlighter([
  { tag: tags.keyword, class: "text-info" },
  { tag: tags.string, class: "text-success" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: "text-warning" },
  { tag: tags.comment, class: "text-muted italic" }
]);

const shellLanguage = StreamLanguage.define(shell);
const dockerfileLanguage = StreamLanguage.define(dockerFile);

export enum CodeLanguage {
  TypeScript = "typescript",
  Python = "python",
  Yaml = "yaml",
  Shell = "shell",
  Dockerfile = "dockerfile"
}

const LANGUAGES: Record<CodeLanguage, Language> = {
  [CodeLanguage.TypeScript]: typescriptLanguage,
  [CodeLanguage.Python]: pythonLanguage,
  [CodeLanguage.Yaml]: yamlLanguage,
  [CodeLanguage.Shell]: shellLanguage,
  [CodeLanguage.Dockerfile]: dockerfileLanguage
};

export const codeLanguageForFile = (fileName: string) => {
  if (fileName.split("/").pop()?.startsWith("Dockerfile")) return CodeLanguage.Dockerfile;
  if (fileName.endsWith(".ts")) return CodeLanguage.TypeScript;
  if (fileName.endsWith(".py")) return CodeLanguage.Python;
  if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) return CodeLanguage.Yaml;
  if (fileName.endsWith(".sh")) return CodeLanguage.Shell;
  return null;
};

export const highlight = (code: string, language: CodeLanguage | null): ReactNode => {
  if (!language) return code;
  const nodes: ReactNode[] = [];
  highlightCode(
    code,
    LANGUAGES[language].parser.parse(code),
    highlighter,
    (text, classes) =>
      nodes.push(
        classes ? (
          <span key={nodes.length} className={classes}>
            {text}
          </span>
        ) : (
          text
        )
      ),
    () => nodes.push("\n")
  );
  return nodes;
};
